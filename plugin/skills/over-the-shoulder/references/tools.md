# Browser tools by agent

How to hover, act and send the step event with each browser agent. Only Claude in Chrome is tested in
this version; the other columns are filled in as each agent is tested.

| Action | Claude in Chrome |
|---|---|
| Find a target | `find` or `read_page` (gives a `ref`) |
| Hover | `computer` with `action: "hover"` and the `ref` (or coordinates) |
| Click | `computer` with `action: "left_click"` on the same `ref` |
| Type | click the field, then `computer` with `action: "type"` (typing shows only after your own hover or click) |
| Step event, label, voice | `javascript_tool` running the `window.dispatchEvent(...)` line, with `selector` for the target |
| Pause | `computer` with `action: "wait"` and `duration: 1` or `2` |
| Check the overlay | `computer` with `action: "screenshot"` |
| Console | `read_console_messages` with a `pattern` |

Notes for Claude in Chrome:
- `form_input` sets a field's value from a script. The overlay outlines the field only if your last hover
  or click was within the past five seconds, so hover the field first; better still, click and type so the
  developer sees the real interaction.
- If a hover fails because the ref went stale after the page redrew, look the element up again before
  carrying on.
- No GIF recording unless the developer asks for one.
- `computer` coordinates are screenshot pixels, scaled before they reach the page (seen 29 Oct 2026: a
  hover at 134, 658 arrived at 146, 718 in a 1710-pixel-wide viewport). Name a step's target with
  `selector`, never with those numbers as `at`.
