import { readFile } from 'node:fs/promises';
import { test, expect, send } from './fixtures.js';

// Real input recorded in the developer's Chrome with test/traces/record.js (see test/traces/README.md),
// replayed through Chrome's own input layer (the DevTools protocol, as browser agents use it), with the
// recorded timing. Each event says who sent it: `agent` (Claude in Chrome), `hand` (the developer's own
// trackpad) or `script` (form_input and javascript_tool, untrusted).
// The moving-hand trace plays for about 25 seconds.
test.setTimeout(90000);

const load = async (name) => JSON.parse(await readFile(new URL(`traces/${name}`, import.meta.url), 'utf8'));

const keys = {
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
};

async function replay(page, trace) {
  await page.setViewportSize({ width: trace.viewport.width, height: trace.viewport.height });
  const cdp = await page.context().newCDPSession(page);
  const events = trace.events.filter((e) => e.type !== 'mark');
  // The pointer starts where the first recorded move came from, so that move arrives as the same small
  // step it was (Chrome measures each move from the pointer's last position), and not as a jump from 0, 0.
  const first = events.find((e) => e.type === 'pointermove');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: first.x - first.mx, y: first.y - first.my });
  await page.waitForTimeout(300);
  const start = performance.now();
  const startEpoch = Date.now();
  let offset = events[0].t;
  let previous = events[0].t;
  for (const e of events) {
    // Idle gaps are cut to a second: every rule in the overlay looks back less than that, except the
    // five seconds in which script-set values count (in these traces they come within ms of a click).
    offset += Math.max(0, e.t - previous - 1000);
    previous = e.t;
    const wait = start + (e.t - offset) - performance.now();
    if (wait > 0) { await new Promise((resolve) => setTimeout(resolve, wait)); }
    // Each event carries its recorded input time (gaps cut as above), not the moment it was sent, so the
    // round trips of the replay itself do not stretch the few ms between an agent's move and its press.
    const at = { x: e.x, y: e.y, timestamp: (startEpoch + e.t - offset) / 1000 };
    if (e.type === 'pointermove') {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at, button: e.buttons ? 'left' : 'none', buttons: e.buttons });
    } else if (e.type === 'pointerdown') {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount: 1 });
      // A change to the test page must not quietly move a recorded click onto another element.
      if (e.target.startsWith('#')) {
        expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, e), `pointerdown at ${e.t}`).toBe(e.target.slice(1));
      }
    } else if (e.type === 'pointerup') {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'left', buttons: 0, clickCount: 1 });
    } else if (e.type === 'wheel') {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...at, deltaX: e.dx, deltaY: e.dy });
    } else if (e.type === 'keydown') {
      // Printable keys were recorded only as "char"; any letter stands in.
      const key = keys[e.key] || { key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88, text: 'x' };
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key, text: undefined });
    } else if (e.by === 'script' && ['input', 'change', 'click'].includes(e.type)) {
      await page.evaluate(({ type, target }) => {
        const el = document.querySelector(target);
        if (type === 'click') { el.click(); return; }
        if (type === 'input' && el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; }
        el.dispatchEvent(new Event(type, { bubbles: true }));
      }, e);
    }
  }
  await cdp.detach();
}

const drawn = async (page) => {
  await send(page, { log: true });
  return page.evaluate(() => JSON.parse(document.querySelector('[data-over-the-shoulder]')?.dataset.log || '[]'));
};
// Only what the agent pointed at may be lit as a hover: never something under the developer's own mouse,
// and nothing after a scroll.
const pointedAt = ['button "Save"', 'textbox "Name"', 'button "Far button"', 'textbox "Notes"'].map((on) => `${on} by agent`);
const entries = (log, action) => log.filter((entry) => entry.action === action).map((entry) => `${entry.on} by ${entry.by}`);

test('real trace: Claude in Chrome with the hand still, every click and field typed into is drawn', async ({ page }) => {
  const trace = await load('2026-10-29-hand-still.json');
  await replay(page, trace);
  const log = await drawn(page);
  expect(entries(log, 'click')).toEqual([
    'button "Save" by agent', 'textbox "Name" by agent', 'button "Far button" by agent', 'textbox "Notes" by agent',
  ]);
  const typed = entries(log, 'type');
  for (const field of ['textbox "Name"', 'textbox "Notes"', 'combobox "Status"']) { expect(typed).toContain(`${field} by agent`); }
  expect(entries(log, 'hover')).toContain('button "Save" by agent');
  for (const hover of entries(log, 'hover')) { expect(pointedAt).toContain(hover); }
});

test('real trace: Claude in Chrome while the developer moves their own mouse, every click is the agent\'s', async ({ page }) => {
  // Recorded on 0.1.1, the overlay drew 3 of these 7 clicks and 1 of the 3 typing runs: each agent move
  // that came within 120ms of a hand move was read as part of the hand's stream, and the click on it as the
  // developer's. Hovers in the middle of the hand's stream are still not lit (best effort).
  const trace = await load('2026-10-29-hand-moving.json');
  await replay(page, trace);
  const log = await drawn(page);
  // The developer's own click on Notes at the end is not among them, and nothing is drawn as theirs.
  expect(entries(log, 'click')).toEqual([
    'button "Save" by agent', 'textbox "Name" by agent', 'button "Far button" by agent', 'textbox "Notes" by agent',
    'button "Far button" by agent', 'button "Save" by agent', 'textbox "Name" by agent',
  ]);
  const typed = entries(log, 'type');
  for (const field of ['textbox "Name"', 'textbox "Notes"']) { expect(typed).toContain(`${field} by agent`); }
  expect(log.filter((entry) => entry.by === 'hand')).toEqual([]);
  for (const hover of entries(log, 'hover')) { expect(pointedAt).toContain(hover); }
  // The developer's typing in Notes after their own click is not drawn: the last entry is the agent's.
  expect(log.filter((entry) => entry.action !== 'step').at(-1)).toMatchObject({ action: 'type', on: 'textbox "Name"', by: 'agent' });
});
