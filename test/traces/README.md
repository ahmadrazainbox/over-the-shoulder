# Recorded traces

Real input from a browser agent and the developer's own mouse, recorded in Chrome and replayed by
`test/replay.spec.js` through Chrome's input layer, so the overlay is tested against what agents really
send, not only against Playwright's mouse.

| File | What it holds |
|---|---|
| `2026-10-29-hand-still.json` | Claude in Chrome: hover, click after a hover, click straight after a click, typing, Tab, Enter, `form_input`, a `javascript_tool` click, a scroll. The developer's mouse moved before and after, not during. |
| `2026-10-29-hand-moving.json` | The same kinds of agent actions while the developer kept moving their own mouse over the page; then the developer's own click and three key presses. On 0.1.1 the overlay drew 3 of its 7 agent clicks. |
| `2026-10-30-mouse-rest.json` | A regular mouse: the developer rested, clicked fields and buttons, typed, and left the window by the bottom edge; Claude in Chrome acted between marks A and F with the hand still. On 0.2.0 the developer's first moves after a rest were logged as agent hovers. |
| `2026-10-30-mouse-nudge.json` | The same, with a click where the mouse button nudged the pointer about 1 px just before the press, after a rest. On 0.2.0 that click was drawn as the agent's. |

Each file has `recorded`, `how`, `chrome`, `extension` (the version that was running), `viewport`,
`drawn` (the overlay's own log at the end of the recording) and `events`. Each event has its time in ms
(`t`), `type`, `trusted`, `target` (`#id` or tag name), pointer coordinates and movement, and `by`:
`agent`, `hand` or `script` (untrusted events from `form_input` and `javascript_tool`). Marks name each
part of the run. Printable keys are stored only as `char`, and no field values are kept.

## What the traces showed (Claude in Chrome, Chrome 156, macOS)

- `hover` is one move straight to the target; `left_click` is one move to the target, then the press about
  1 ms later, with or without a hover first. There is no stream of small moves.
- `type` sends real key events, one per character, a few ms after the click.
- `form_input` focuses the field (a trusted `focusin`) and sets the value with untrusted `input` and
  `change` events; a `javascript_tool` click is one untrusted `click`, with no pointer events.
- The developer's own trackpad moves come every ~16 ms with fractional coordinates; less than 120 ms apart,
  they were at most 166 px apart. Agent moves came in whole pixels and landed 400 px or more from the
  developer's pointer, and the developer's next move landed back near where it had been. The agent's
  press came 0.5 to 3 ms after its move; the developer's own presses came 58 and 221 ms after their last
  move, which was a still one (no jump).

## What the regular-mouse traces showed (Chrome 156, macOS)

- A mouse reports fractional coordinates, as the trackpad did. After a rest, the hand settles 0 to 1 px
  before a press, in one move or a few, each more than 120 ms after the last; the button itself can nudge
  the pointer 8 to 20 ms before the press.
- Leaving the window by the bottom edge sends still moves below the page (y beyond `innerHeight`).
- On real pages (31 Oct 2026) Claude in Chrome pressed up to 20 ms after its move, by input time.

## Recording a new trace

1. Open `test/page.html` on a host the extension runs on (for example `over-the-shoulder.test/test/page.html`
   with Laravel Herd, or `npx http-server` and `127.0.0.1`).
2. Run `record.js` in the page (with the agent's JavaScript tool: fetch it and `eval` it). It keeps events
   in `window.__otsTrace`.
3. Push a mark before each part of the run:
   `__otsTrace.events.push({ t: -1, type: 'mark', label: 'click Name straight after click' })`.
4. Let the agent act, and say whether the developer's hand moves meanwhile.
5. Save `JSON.stringify({ trace: __otsTrace, log, version })` (the browser tool's output is cut short, so
   post it to a local receiver or save it as a download), add the `by` of each event, drop
   `mousemove`, `mousedown`, `mouseup`, `pointerover` and `pointerenter` (copies of the pointer events), and
   add a test in `test/replay.spec.js`.
