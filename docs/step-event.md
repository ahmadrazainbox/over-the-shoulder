# The step event

How an agent adds step numbers, findings and spoken lines to the overlay, and reads back what it drew.
The Claude Code skill does all of this for you; this page is for anyone writing their own agent or tool.

```js
window.dispatchEvent(new CustomEvent('over-the-shoulder', {
  detail: JSON.stringify({ step: 4, label: 'Total shows 0.00', say: 'Now I save. Watch the total.' })
}))
```

`detail` must be a JSON string. All fields are optional: `step` (badge), `label` (finding, up to 200
characters), `say` (spoken if voice is on, up to 300 characters), `selector` (the step's own target, a
CSS selector in the top page; not found sends the step to the corner toast), `at` (`{ x, y }` in the
page's CSS pixels, instead of `selector`), `log` (`true` writes the page's log of what was drawn),
`summary` (`true` shows the findings sent with a `label` as one list in the bottom-left corner, one line
per step with its latest finding (a `label` sent without a `step` beside a step's badge counts as that
step's), for one screenshot at the end of a run; the newest always show, and older ones that do not fit
are counted; it goes at the next action or step, or a navigation) and `clear` (`true` forgets those
findings, to start a new run, and takes the last step's badge and finding away). The findings are kept
for the page load (newest 50); a single-page app's route changes keep them.

The overlay answers on its host element, `document.querySelector('[data-over-the-shoulder]')`:
`dataset.last` is what the latest step drew (`on`: the element, or `toast`; after `summary` or `clear` on
their own, `on` is `summary` with the number of `findings`), `dataset.log` the log as JSON
(after `log: true`), `dataset.version` the extension's version. The skill reads these to check its report.
On each page load the host is added only at the first step event with a `step`, `label`, `log`, `summary`
or `clear`, or the first hover, click or typing it draws, so before that it is not there even when the overlay runs. To check
that it runs, send a step 0 event, as the skill does, and look for the toast.

One step badge and one finding label show at a time. They follow their element as the page scrolls, and
clear when the agent acts on another element or sends a step for another target (or one whose `selector`
matches nothing, or a new step with nothing lit since the last one), when the element is removed or
replaced by a different-looking one, when the page navigates, when the agent acts inside an iframe, or 60
seconds after the element was lit. A step on the same element without a `label` keeps the previous finding
beside its new badge, and a `label` without a `step` keeps the previous badge. So a screenshot usually
shows one step's result; to show the run's results together, send `summary: true` at the end.

A select chosen with the mouse logs a click and then typing (a value was entered). Rows a "Select all"
ticks while its click is handled are part of that click; rows ticked later, in a timer, log as typing.

Any script on a page where the overlay runs can send this event, not only your agent, and could also draw
look-alike marks of its own. So treat the overlay as a guide to follow the agent, not as proof of what it
did; the agent's chat and its final report are the record. Enable the extension only on sites you trust.
