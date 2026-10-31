# Browser tools by agent

How to hover, act and send the step event with each browser agent. Only Claude in Chrome is tested in
this version; the other columns are filled in as each agent is tested.

| Action | Claude in Chrome |
|---|---|
| Find a target | `find` or `read_page` (gives a `ref`); for a step's `selector`, an id, `name` or `aria-label` from `read_page`, or read the element's id from the page if `read_page` shows none |
| Hover | `computer` with `action: "hover"` and the `ref` (or coordinates) |
| Click | `computer` with `action: "left_click"` on the same `ref` |
| Type | click the field, then `computer` with `action: "type"` (typing shows only after your own hover or click) |
| Choose in a select | click it, then `type` the first letters of the option (on macOS the native list ignores arrow keys and Enter from the tool) |
| Step event, label, voice | `javascript_tool` running the `window.dispatchEvent(...)` line, with `selector` for the target |
| Pause | `computer` with `action: "wait"` and `duration: 1` or `2` |
| Check the overlay | `computer` with `action: "screenshot"` |
| Console | `read_console_messages` with a `pattern` |

Notes for Claude in Chrome:
- `form_input` sets a field's value from a script. The overlay outlines the field only if your last hover
  or click was within the past five seconds, so hover the field first; better still, click and type so the
  developer sees the real interaction.
- A click through `javascript_tool` (`element.click()`) is not drawn: it arrives without pointer events
  and is untrusted. Click with `computer` instead.
- `key` presses outside a field (Escape to close a dialog, Enter on a focused button) are not drawn; say
  in chat which key you press and why.
- `scroll` is not drawn and does not light anything; hover the next target after scrolling to it.
- The developer may move their own mouse while you act. Your clicks, and the typing after them, still
  show (a click straight after a jump to its target is yours); a hover while their mouse is moving may not
  light. A click within 200 CSS pixels of where their pointer is moving, or within 4 pixels of where it
  rests, may also be missed: check the log (`log: true`), and if a click is missing, take a screenshot,
  ask the developer to keep the mouse still, and do it again only if it did not happen (never a save,
  submit, send or delete).
- If a hover fails because the ref went stale after the page redrew, look the element up again before
  carrying on. Refs also go stale after a navigation or reload: `find` again first.
- No GIF recording unless the developer asks for one.
- The tool may suggest `browser_batch` after single calls: ignore that while the developer is watching.
- Tool output is cut short at about a thousand characters: read `dataset.log` in slices, e.g.
  `JSON.parse(h.dataset.log).slice(-10)`. Save screenshots to disk when the report must cite them by file.
- `computer` coordinates are screenshot pixels, scaled before they reach the page (seen 29 Oct 2026: a
  hover at 134, 658 arrived at 146, 718 in a 1710-pixel-wide viewport). Name a step's target with
  `selector`, never with those numbers as `at`.
