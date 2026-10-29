import { readFile } from 'node:fs/promises';
import { test, expect, overlay, send } from './fixtures.js';

// The spot is drawn 6px outside its target on every side.
// Both boxes are measured inside the frame (Playwright's boundingBox is relative to the main page).
async function expectSpotOn(frame, selector) {
  const target = await frame.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width };
  });
  const { spot } = await overlay(frame);
  expect(spot, `spot shown on ${selector}`).not.toBeNull();
  expect(Math.abs(spot.x - (target.x - 6))).toBeLessThan(2);
  expect(Math.abs(spot.y - (target.y - 6))).toBeLessThan(2);
  expect(Math.abs(spot.w - (target.width + 12))).toBeLessThan(2);
}

const centre = async (page, selector) => {
  const b = await page.locator(selector).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};


test('an agent hover (one jump to the target) lights it', async ({ page }) => {
  const { x, y } = await centre(page, '#save');
  await page.mouse.move(x, y);
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await expectSpotOn(page, '#save');
});

test('a hand-like stream of small moves does not light anything', async ({ page }) => {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  await page.mouse.move(20, 20, { steps: 3 });
  await page.waitForTimeout(300);
  const { x, y } = await centre(page, '#far');
  await page.mouse.move(x, y, { steps: 40 });
  await page.waitForTimeout(200);
  expect((await overlay(page)).spot).toBeNull();
});

test('a click shows a ripple and outlines the target', async ({ page }) => {
  // The pointer is brought near in small, hand-like steps, then the click's own move is one short hop,
  // which is not lit as a hover; so the outline can only come from the click.
  const { x, y } = await centre(page, '#save');
  await page.mouse.move(x + 35, y + 35, { steps: 30 });
  await page.waitForTimeout(300);
  expect((await overlay(page)).spot).toBeNull();
  await page.click('#save');
  const state = await overlay(page);
  expect(state.ripples).toBeGreaterThan(0);
  await expectSpotOn(page, '#save');
});

// Typing is shown after the agent's own hover or click, as the skill tells agents to do.
const agentHover = async (page, selector) => {
  const { x, y } = await centre(page, selector);
  await page.mouse.move(x, y);
};

test('text inserted in one go (fill) outlines the field', async ({ page }) => {
  await agentHover(page, '#name');
  await page.locator('#name').fill('Ada');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await expectSpotOn(page, '#name');
});

test('a value set by a script that fires change outlines the select', async ({ page }) => {
  await agentHover(page, '#status');
  await page.locator('#status').selectOption('Closed');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await expectSpotOn(page, '#status');
});

test('a button inside a shadow root is lit, not its host', async ({ page }) => {
  await page.locator('#inner').click();
  await expectSpotOn(page, '#inner');
});

test("the developer's own click and typing are not outlined", async ({ page }) => {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  const { x, y } = await centre(page, '#name');
  await page.mouse.move(x, y, { steps: 30 });
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.type('typed by hand');
  const state = await overlay(page);
  expect(state.spot).toBeNull();
  expect(state.ripples).toBe(0);
});

test('typing before any agent action (the developer, after a load) is not outlined', async ({ page }) => {
  await page.locator('#name').focus();
  await page.keyboard.type('mine');
  expect((await overlay(page)).spot).toBeNull();
});

test('a lone jump followed straight away by more moves is the hand, and is taken back', async ({ page }) => {
  const { x, y } = await centre(page, '#far');
  await page.mouse.move(x, y);
  await page.mouse.move(x + 30, y + 30, { steps: 6 });
  await page.waitForTimeout(100);
  expect((await overlay(page)).spot).toBeNull();
  await page.keyboard.press('Tab');
  await page.keyboard.type('mine');
  expect((await overlay(page)).spot).toBeNull();
});

test('a "lit" notice from a window that is not one of its frames is ignored', async ({ page, context }) => {
  await agentHover(page, '#save');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  const [popup] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => { window.__w = window.open('about:blank'); })]);
  await page.evaluate(() => window.__w.eval("opener.postMessage({ overTheShoulder: 'lit' }, '*')"));
  await page.waitForTimeout(200);
  expect((await overlay(page)).spot).not.toBeNull();
  await popup.close();
});

test('page-fired input events long after any agent action are ignored', async ({ page }) => {
  await page.waitForTimeout(5600);
  await page.evaluate(() => document.getElementById('name').dispatchEvent(new Event('input', { bubbles: true })));
  expect((await overlay(page)).spot).toBeNull();
});

test('synthetic (untrusted) pointer events are ignored', async ({ page }) => {
  await page.evaluate(() => {
    const el = document.getElementById('save');
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, clientX: r.x + 5, clientY: r.y + 5 };
    el.dispatchEvent(new PointerEvent('pointermove', init));
    el.dispatchEvent(new PointerEvent('pointerdown', init));
  });
  const state = await overlay(page);
  expect(state.spot).toBeNull();
  expect(state.ripples).toBe(0);
});

test('step number and finding label sit on the lit target', async ({ page }) => {
  const { x, y } = await centre(page, '#save');
  await page.mouse.move(x, y);
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await send(page, { step: 3, label: 'Saved, but shown as 00:00' });
  const state = await overlay(page);
  expect(state.badge?.text).toBe('3');
  expect(state.label?.text).toBe('Saved, but shown as 00:00');
});

test('labels, toasts and steps are plain text, capped in length', async ({ page }) => {
  const markup = '<img src=x onerror=1><b>bold</b>';
  await send(page, { step: '123456', label: markup + 'x'.repeat(400) });
  const toast = await page.evaluate(() => {
    const el = document.querySelector('[data-over-the-shoulder]').shadowRoot.querySelector('.toast');
    return { elements: el.querySelectorAll('img, b:not(:first-child)').length, step: el.firstChild.textContent, text: el.lastChild.textContent };
  });
  expect(toast.elements).toBe(0);
  expect(toast.step).toBe('1234');
  expect(toast.text.startsWith(markup)).toBe(true);
  expect(toast.text).toHaveLength(200);

  await agentHover(page, '#save');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await send(page, { step: 2, label: markup + 'y'.repeat(400) });
  const label = await page.evaluate(() => {
    const el = document.querySelector('[data-over-the-shoulder]').shadowRoot.querySelector('.label');
    return { children: el.children.length, length: el.textContent.length };
  });
  expect(label).toEqual({ children: 0, length: 200 });
});

test('with nothing lit, the step shows as a toast', async ({ page }) => {
  await send(page, { step: 7, label: 'Checking the inner frame' });
  const { toast } = await overlay(page);
  expect(toast?.text).toBe('7Checking the inner frame');
});

// A short hop between neighbouring fields is not lit as a hover, so the field of the step before is
// still lit when the next step arrives.
const hopToNeighbour = async (page) => {
  await page.locator('#pair').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await agentHover(page, '#first');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await send(page, { step: 1 });
  const first = await centre(page, '#first');
  const last = await centre(page, '#last');
  expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeLessThanOrEqual(80);
  // An agent pauses between actions; a move straight after the hover would be taken as the hand's.
  await page.waitForTimeout(400);
  await page.mouse.move(last.x, last.y);
  await page.waitForTimeout(200);
  await expectSpotOn(page, '#first');
  return last;
};

test('a new step with nothing lit since the last one goes to the toast, not on the old element', async ({ page }) => {
  await hopToNeighbour(page);
  await send(page, { step: 2 });
  const state = await overlay(page);
  expect(state.spot).toBeNull();
  expect(state.badge).toBeNull();
  expect(state.toast?.text).toBe('2');
});

test('a step that names its target with at is drawn on that element', async ({ page }) => {
  const last = await hopToNeighbour(page);
  await send(page, { step: 2, at: last });
  await expectSpotOn(page, '#last');
  expect((await overlay(page)).badge?.text).toBe('2');
});

test('a step that names its target with a selector is drawn on that element', async ({ page }) => {
  await agentHover(page, '#far');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await send(page, { step: 3, selector: '#save', label: 'This one' });
  await expectSpotOn(page, '#save');
  const state = await overlay(page);
  expect(state.badge?.text).toBe('3');
  expect(state.label?.text).toBe('This one');
});

test('a named target that is not on the page clears the outline and shows the toast', async ({ page }) => {
  await agentHover(page, '#save');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await send(page, { step: 4, selector: '#missing' });
  let state = await overlay(page);
  expect(state.spot).toBeNull();
  expect(state.toast?.text).toBe('4');
  await send(page, { step: 5, selector: 'not a [valid selector' });
  state = await overlay(page);
  expect(state.spot).toBeNull();
  expect(state.toast?.text).toBe('5');
});

test('the same step sent again (a label added) keeps its target', async ({ page }) => {
  await agentHover(page, '#save');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await send(page, { step: 6 });
  await send(page, { step: 6, label: 'Total is wrong' });
  await send(page, { label: 'Still the same step' });
  await expectSpotOn(page, '#save');
  const state = await overlay(page);
  expect(state.badge?.text).toBe('6');
  expect(state.label?.text).toBe('Still the same step');
});

test('a step after a click that opens a modal dialog is raised above the dialog', async ({ page }) => {
  await page.locator('#open-dialog').scrollIntoViewIfNeeded();
  await page.click('#open-dialog');
  await expect(page.locator('#dialog')).toBeVisible();
  // The browser's top layer stacks in the order things are shown: the overlay is above the dialog when it
  // is shown again after the dialog opened.
  // Toggle events arrive a moment late, so the ones from the click's own raise are let through first.
  await page.evaluate(() => {
    document.querySelector('[data-over-the-shoulder]').addEventListener('toggle', (e) => {
      if (e.newState === 'open') { window.raisedAfterDialog = true; }
    });
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.raisedAfterDialog = false; });
  await send(page, { step: 7 });
  await expect.poll(() => page.evaluate(() => window.raisedAfterDialog)).toBe(true);
  await page.evaluate(() => { window.raisedAfterDialog = false; });
  await send(page, { step: 8, selector: '#dialog-ok' });
  await expect.poll(() => page.evaluate(() => window.raisedAfterDialog)).toBe(true);
  await expectSpotOn(page, '#dialog-ok');
  expect((await overlay(page)).badge?.text).toBe('8');
});

// What the overlay drew, as the agent reads it back from the overlay's own element.
const ots = (page, key) => page.evaluate((k) => {
  const value = document.querySelector('[data-over-the-shoulder]')?.dataset[k];
  return value === undefined ? null : k === 'version' ? value : JSON.parse(value);
}, key);
const drawnLog = async (page) => { await send(page, { log: true }); return ots(page, 'log'); };

test('the log names what was hovered, clicked and typed into, never what was typed', async ({ page }) => {
  await agentHover(page, '#save');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await page.waitForTimeout(400);
  await page.click('#save');
  await page.waitForTimeout(400);
  await agentHover(page, '#name');
  await page.locator('#name').fill('Ada secret 42');
  await page.waitForTimeout(400);
  await agentHover(page, '#status');
  await page.locator('#status').selectOption('Closed');
  const log = await drawnLog(page);
  const seen = log.map(({ action, on, trusted }) => ({ action, on, trusted }));
  expect(seen).toContainEqual({ action: 'hover', on: 'button "Save"', trusted: true });
  expect(seen).toContainEqual({ action: 'click', on: 'button "Save"', trusted: true });
  expect(seen).toContainEqual({ action: 'type', on: 'textbox "Name"', trusted: true });
  // A value set by a script and announced with change is untrusted, and the select's options are not read.
  expect(seen).toContainEqual({ action: 'type', on: 'combobox "Status"', trusted: false });
  const text = JSON.stringify(log);
  expect(text).not.toContain('Ada');
  expect(text).not.toContain('secret');
  expect(text).not.toContain('Closed');
  expect(log.every((entry, i) => i === 0 || entry.n > log[i - 1].n)).toBe(true);
});

test('each step answers with what it drew: the element, or the toast', async ({ page }) => {
  await agentHover(page, '#save');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await send(page, { step: 1, label: 'Saved' });
  expect(await ots(page, 'last')).toMatchObject({ action: 'step', step: '1', on: 'button "Save"', label: true });
  await send(page, { step: 2, selector: '#missing' });
  expect(await ots(page, 'last')).toMatchObject({ action: 'step', step: '2', on: 'toast', label: false });
  const last = await ots(page, 'last');
  const log = await drawnLog(page);
  expect(log.filter((entry) => entry.action === 'step').map((entry) => entry.on)).toEqual(['button "Save"', 'toast']);
  expect(log.find((entry) => entry.n === last.n)).toMatchObject({ step: '2', on: 'toast' });
});

test('the extension version is readable after the first step event', async ({ page }) => {
  const { version } = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  await send(page, { step: 0, label: 'Overlay check' });
  expect(await ots(page, 'version')).toBe(version);
});

test('typing is one entry per field, and the log keeps the newest 200 entries', async ({ page }) => {
  await page.click('#notes');
  await page.keyboard.type('hello');
  let log = await drawnLog(page);
  expect(log.filter((entry) => entry.action === 'type')).toHaveLength(1);
  expect(log.find((entry) => entry.action === 'type').on).toBe('textbox "Notes"');
  expect(JSON.stringify(log)).not.toContain('hello');
  await page.evaluate(() => {
    for (let i = 0; i < 250; i++) {
      window.dispatchEvent(new CustomEvent('over-the-shoulder', { detail: JSON.stringify({ step: i % 100 }) }));
    }
  });
  const last = await ots(page, 'last');
  log = await drawnLog(page);
  expect(log).toHaveLength(200);
  expect(log[199].n - log[0].n).toBe(199);
  // The newest are kept: the last entry is the last step sent.
  expect(log[199].n).toBe(last.n);
});

test('text inside editable elements, fields and labels never becomes part of a name', async ({ page }) => {
  // Clicked on the words "Row" and "Cell", outside the editable parts, so the row and cell are lit.
  await page.locator('#row').click({ position: { x: 5, y: 8 } });
  await page.waitForTimeout(400);
  await page.locator('#cell').click({ position: { x: 5, y: 8 } });
  await page.waitForTimeout(400);
  await page.locator('#edit').click();
  await page.keyboard.type('zzz');
  await page.waitForTimeout(400);
  await page.locator('#code').click();
  await page.keyboard.type('9');
  await page.waitForTimeout(400);
  await page.locator('#comment').click();
  await page.keyboard.type('more');
  const log = await drawnLog(page);
  const on = log.map((entry) => entry.on);
  expect(on).toContain('listitem "Row"');
  expect(on).toContain('cell "Cell"');
  expect(on).toContain('textbox "Code"');
  expect(on).toContain('textbox "Comment"');
  const text = JSON.stringify(log);
  for (const typed of ['typed', 'zzz', 'prefilled', 'more']) { expect(text).not.toContain(typed); }
});

test("a code editor's drawn lines and an ARIA text box give no text", async ({ page }) => {
  await page.locator('#code-line').click();
  await page.waitForTimeout(400);
  await page.locator('#aria-box').click();
  const log = await drawnLog(page);
  const on = log.map((entry) => entry.on);
  expect(on).toContain('span');
  expect(on).toContain('textbox');
  const text = JSON.stringify(log);
  for (const typed of ['apiKey', 'sk-', 'typed']) { expect(text).not.toContain(typed); }
});

test('two fields with the same name, typed one after the other, are two entries', async ({ page }) => {
  await page.locator('#qty1').click();
  await page.keyboard.type('1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('2');
  const log = await drawnLog(page);
  expect(log.filter((entry) => entry.action === 'type' && entry.on === 'textbox "Qty"')).toHaveLength(2);
});

test('a log request includes the step sent with it, and an event that draws nothing leaves no answer', async ({ page }) => {
  await send(page, { step: 9, log: true });
  const log = await ots(page, 'log');
  expect(log[log.length - 1]).toMatchObject({ action: 'step', step: '9', on: 'toast' });
  expect(await ots(page, 'last')).toMatchObject({ step: '9' });
  await send(page, { say: 'Only a spoken line' });
  expect(await ots(page, 'last')).toBeNull();
});

test("the developer's own click is logged as theirs when shown", async ({ page, worker }) => {
  await worker.evaluate(() => chrome.storage.local.set({ showMine: true }));
  await page.waitForTimeout(200);
  const { x, y } = await centre(page, '#save');
  await page.mouse.move(x - 40, y, { steps: 10 });
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.down();
  await page.mouse.up();
  const log = await drawnLog(page);
  expect(log.find((entry) => entry.action === 'click')).toMatchObject({ on: 'button "Save"', by: 'hand' });
});

for (const zoom of ['1.5', '0.8']) {
  test(`outlines and badges land on their target when the page sets CSS zoom ${zoom}`, async ({ page }) => {
    await page.evaluate((z) => { document.documentElement.style.zoom = z; }, zoom);
    await page.waitForTimeout(300);
    await agentHover(page, '#save');
    await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
    await expectSpotOn(page, '#save');
    await send(page, { step: 1 });
    const target = await page.locator('#save').evaluate((el) => el.getBoundingClientRect().toJSON());
    const { badge } = await overlay(page);
    expect(Math.abs(badge.x - (target.right + 2))).toBeLessThan(3);
  });
}

test('an outline follows when the page changes its zoom while it is lit', async ({ page }) => {
  await agentHover(page, '#save');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await page.evaluate(() => { document.documentElement.style.zoom = '1.5'; });
  await page.waitForTimeout(300);
  await expectSpotOn(page, '#save');
});

test('an overlay left behind by a reloaded extension is removed, so there is only one', async ({ page, server }) => {
  await page.goto(`${server}/stale.html`);
  await page.waitForTimeout(1100);
  await send(page, { step: 1 });
  const hosts = await page.evaluate(() => [...document.querySelectorAll('[data-over-the-shoulder]')].map((el) => el.id));
  expect(hosts).toEqual(['']);
});

test('after the extension is reloaded, the old overlay removes itself instead of drawing', async ({ page, worker }) => {
  await send(page, { step: 1 });
  expect(await page.locator('[data-over-the-shoulder]').count()).toBe(1);
  await worker.evaluate(() => chrome.runtime.reload()).catch(() => { /* the worker goes away */ });
  // The old copy notices on its next event; sent again until it has, however long the reload takes.
  await expect.poll(async () => {
    await send(page, { step: 2 });
    return page.locator('[data-over-the-shoulder]').count();
  }, { timeout: 10000 }).toBe(0);
});

test("the page's own CSS cannot hide the overlay", async ({ page }) => {
  await page.addStyleTag({ content: 'div { display: none !important; visibility: hidden !important; opacity: 0 !important; }' });
  await agentHover(page, '#save');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  const style = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('[data-over-the-shoulder]'));
    return { display: s.display, visibility: s.visibility, opacity: s.opacity };
  });
  expect(style).toEqual({ display: 'block', visibility: 'visible', opacity: '1' });
});

test('a click inside a container too large to outline outlines the clicked element', async ({ page }) => {
  await page.locator('#in-big').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator('#in-big').click();
  await expectSpotOn(page, '#in-big');
});

test('back and forward, and Inertia page visits, clear the spotlight too', async ({ page }) => {
  await page.click('#nav');
  await page.waitForTimeout(1000);
  await agentHover(page, '#save');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await page.goBack();
  await expect.poll(async () => (await overlay(page)).spot, { timeout: 2000 }).toBeNull();

  await agentHover(page, '#far');
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await page.evaluate(() => {
    window.navigation = undefined;
    document.dispatchEvent(new Event('inertia:navigate'));
  });
  await expect.poll(async () => (await overlay(page)).spot, { timeout: 2000 }).toBeNull();
});

test('a single-page navigation clears the spotlight soon after', async ({ page }) => {
  await page.click('#nav');
  await expect(page).toHaveURL(/\/next$/);
  await page.waitForTimeout(1000);
  expect((await overlay(page)).spot).toBeNull();
});

test('a click inside an iframe is drawn in that frame', async ({ page }) => {
  const frame = page.frame({ url: /frame\.html$/ });
  await frame.locator('#frame-button').click();
  await expectSpotOn(frame, '#frame-button');
});

test('an action inside an iframe clears the stale outline in the top page', async ({ page }) => {
  const { x, y } = await centre(page, '#save');
  await page.mouse.move(x, y);
  await expect.poll(async () => (await overlay(page)).spot).not.toBeNull();
  await page.frame({ url: /frame\.html$/ }).locator('#frame-button').click();
  await expect.poll(async () => (await overlay(page)).spot).toBeNull();
});

// Replaces chrome.tts.speak in the service worker with a recorder and applies the given settings.
const stubVoice = (worker, settings) => worker.evaluate(async (settings) => {
  globalThis.spoken = [];
  chrome.tts.speak = (text, options) => { globalThis.spoken.push({ text, options }); };
  await chrome.storage.local.set(settings);
}, settings);
const spoken = (worker) => worker.evaluate(() => globalThis.spoken);

test('voice: a tab that is not in front cannot speak, the one in front can', async ({ page, context, worker }) => {
  await stubVoice(worker, { voice: true });
  const other = await context.newPage();
  await other.bringToFront();
  await send(page, { say: 'From a background tab' });
  await page.waitForTimeout(500);
  expect(await spoken(worker)).toEqual([]);
  await page.bringToFront();
  await send(page, { say: 'From the tab in front' });
  await expect.poll(async () => (await spoken(worker)).map((s) => s.text)).toEqual(['From the tab in front']);
});

test('voice: nothing is spoken while voice is off, and it is once switched on', async ({ page, worker }) => {
  await stubVoice(worker, { voice: false });
  await send(page, { say: 'Should stay silent' });
  await page.waitForTimeout(500);
  expect(await spoken(worker)).toEqual([]);
  await worker.evaluate(() => chrome.storage.local.set({ voice: true }));
  await send(page, { say: 'Now it speaks' });
  await expect.poll(async () => (await spoken(worker)).map((s) => s.text)).toEqual(['Now it speaks']);
});

test('voice: with voice on, the line is spoken, capped and rate limited', async ({ page, worker }) => {
  await stubVoice(worker, { voice: true, rate: 1.4, mode: 'queue' });
  await send(page, { say: 'x'.repeat(500) });
  await send(page, { say: 'Too soon after the last line' });
  await page.waitForTimeout(300);
  const lines = await spoken(worker);
  expect(lines).toHaveLength(1);
  expect(lines[0].text).toHaveLength(300);
  expect(lines[0].options).toMatchObject({ rate: 1.4, enqueue: true });
});

test('voice: in queue mode at most two lines wait', async ({ page, worker }) => {
  await stubVoice(worker, { voice: true, mode: 'queue' });
  for (let i = 1; i <= 4; i++) {
    await send(page, { say: `Line ${i}` });
    await page.waitForTimeout(450);
  }
  expect((await spoken(worker)).map((s) => s.text)).toEqual(['Line 1', 'Line 2']);
});

test('voice: only the top frame of a tab may speak', async ({ worker }) => {
  await stubVoice(worker, { voice: true });
  const call = (frameId) => worker.evaluate((frameId) => new Promise((resolve) => {
    globalThis.overTheShoulder.message({ type: 'say', text: `frame ${frameId}` }, { tab: { active: true }, frameId }, resolve);
    setTimeout(resolve, 300);
  }), frameId);
  await call(3);
  expect(await spoken(worker)).toEqual([]);
  await call(0);
  expect((await spoken(worker)).map((s) => s.text)).toEqual(['frame 0']);
});

test('voice: an out-of-range stored speed is clamped', async ({ worker }) => {
  const rateFor = async (rate) => {
    await stubVoice(worker, { voice: true, rate });
    await worker.evaluate(() => new Promise((resolve) => {
      globalThis.overTheShoulder.message({ type: 'say', text: 'speed' }, { tab: { active: true }, frameId: 0 }, resolve);
    }));
    await new Promise((resolve) => setTimeout(resolve, 450));
    return (await spoken(worker))[0].options.rate;
  };
  expect(await rateFor(10)).toBe(2);
  expect(await rateFor(0)).toBe(1);
  expect(await rateFor(0.1)).toBe(0.5);
});
