# Changelog

## Unreleased

- README: a short demo GIF of a real run (an agent checking a cart total in a local test copy of a point-of-sale app).
- The overlay is kept out of the accessibility tree (`aria-hidden`), so a screen reader does not read its
  badges and findings, and an agent reading the page's tree does not see its own labels.
- With reduced motion turned on in the system, the outline no longer pulses or eases, and a click shows a
  still ring that fades instead of growing.
- README: shorter, with badges, a "How it works" diagram and a FAQ; every field of the step event moved to
  [docs/step-event.md](docs/step-event.md). New SECURITY.md (private vulnerability reporting).
- Repository: CI actions pinned to commit SHAs, Dependabot (monthly, grouped), CI keeps the JSON test
  report when a run fails, a test that the release zip holds exactly the extension, `.editorconfig`, and
  the plugin and package metadata point to the GitHub repository.

## 0.2.5 (2026-11-07)

- An overlay left behind after the extension is reloaded no longer adds listeners to shadow roots the
  developer clicks through (it already drew and logged nothing).

## 0.2.4 (2026-11-07)

- A "Select all" inside a shadow root whose `change` handler ticks the rows is now the click's, like one
  in the page (#32): `change` does not leave a shadow root, so the overlay listens in each open shadow
  root a real press passes through. Rows ticked later, in a timer, still log as typing; README and
  tools.md say so.
- A summary on screen is fitted again when the window is resized, so its newest lines stay in view and
  the rest are counted (#34). A page Chrome brings back with Back or Forward keeps its findings; the
  skill says so.
- A select chosen with the mouse stays a click and then typing (#33): headless Chromium cannot choose an
  option with the mouse to test a rule, and a time window would hide a keyboard choice made just after
  the click. README and tools.md say so.
- Tests: every run keeps its JSON report in `test-results-last/` (one file per run, not cleared by the next
  run), so a failure that does not come back is still named; a failing test keeps its trace in
  `test-results/` until the next run (#35).

## 0.2.3 (2026-11-07)

- Skill and tools.md, from fresh agents' QA runs (#24): type straight after the click that focuses a
  field, then check the click; a selector for a target with no id or label, checked to match one element;
  a triple-click logs three clicks; the log names elements as the browser does, not as `find` does; two
  unnamed fields are told apart by the step's selector; the corner toast can cover the page's Save button.
- Clicking a checkbox or radio, or its label, no longer adds a typing entry after the click (#25): the
  trusted input and change that follow a real press on it are the click's own. One set or clicked by a
  script (an agent's form tool), toggled with Space or chosen with the arrow keys still counts as typing.
  Rows a real click on a "Select all" toggles by script, while the page handles that click, are the
  click's too; the same select-all run by a script still counts as typing.
- A run's results together (#23): `{ summary: true }` shows the findings the agent sent with a `label` as
  one list in the bottom-left corner, one line per step with its latest finding, for one screenshot at
  the end; the newest always show and older ones that do not fit are counted. It goes at the next action
  or step or a navigation, and `{ clear: true }` forgets the findings and takes the last step's badge and
  finding away. The overlay keeps the agent's own label text for this page load (newest 50; it can quote
  the page, and the skill keeps passwords and personal data out of it), shown in its own element;
  PRIVACY.md says so. A finding sent without a step, beside a step's badge, counts as that step's. The
  skill takes the summary screenshot at the end of a QA run.
- Skill and tools.md, from a fresh agent's QA run on a point-of-sale page: the overlay check sends a
  `selector` that matches nothing, so it always goes to the toast; every step's `selector` is checked to
  match one element before acting, whatever its source; a QA item that cannot be run is Not checked, and
  the agent asks for test data first; a wrong finding is corrected by sending the same step again; voice's
  end-of-point sentence goes with the next step; a hover on the spot just clicked adds no log entry; keys
  in a field make one typing entry; numbered ids can change between loads; `javascript_tool` withholds a
  result with a URL query string.

## 0.2.2 (2026-11-06)

- Inputs, selects and links are logged with the role the browser gives them (#22), per HTML-AAM §3.5 and
  Chrome: a number field is a `spinbutton` (was `textbox`), a search field a `searchbox`, a text-like or
  number field whose `list` names a datalist a `combobox`, an image or file input a `button`, a select
  shown as a list a `listbox`, and a link without `href` is `generic`, still named by its visible text.
  Date, time, month, week and color inputs are named by their type. A file input's chosen file is never
  read. Found in a Claude in Chrome QA run on a shop's cart.
- A step's badge and finding no longer move to a different-looking element that takes a removed element's
  place, and a later step without its own `selector` goes to the corner toast rather than onto it; a
  re-rendered copy of the same control keeps them. Two identical controls (a Delete button in each row)
  still cannot be told apart.
- README and skill: the overlay's host element appears only at the first step event or drawn action on
  each page, so a step 0 event is the check that it runs; one step badge and finding show at a time, and
  what clears them; a step comes back as text.

## 0.2.1 (2026-10-31)

- The developer's own clicks are no longer drawn as the agent's (#15): a lone move within 4 px of where the
  hand rests keeps the hand's stream and is not a jump, so a click after the pointer settles, or after the
  mouse button nudges it, stays the developer's, also straight after the agent acted elsewhere. Still moves
  that Chrome repeats at exactly the same spot do not count as a hand moving. A press within 40 ms (was
  15) of a jump of more than 200 px is the agent's: Claude in Chrome pressed up to 20 ms after its move on
  real pages.
- The developer's mouse is no longer logged as agent hovers (#16): a hover taken back because a hand stream
  followed is removed from the log too, and a move outside the page is never lit.
- README and PRIVACY: typing straight after the agent's click, with no mouse action first, is drawn as the
  agent's (#17).
- Skill (#18): check every click in the log; if it is missing or wrong, take a screenshot first, redo only
  if it did not happen, and never redo a save, submit, send or delete; ask the developer not to scroll
  during clicks; type straight after the click; send prompts to the corner toast with a selector that
  matches nothing.
- Leaving a text field is not typing: the field's change event as it loses focus no longer adds a typing
  entry or moves the outline back to it, beside the click that left it.
- Skill and tools.md, from a fresh agent following only the skill: wait for a reload on a version
  mismatch, a log read snippet, QA reports list each item Pass or Fail, choosing in a select, reading the
  log in slices.
- Trade-off: an agent click within 4 px of where the developer's pointer rests is counted as theirs.
- Found with a regular mouse on the test page and two real web apps; two regular-mouse recordings are
  replayed in the tests.

## 0.2.0 (2026-10-29)

- The agent's clicks show while the developer moves their own mouse (#8): a press within 15 ms of a move
  that jumped more than 200 px to it is the agent's, so the click and the typing after it are drawn (before,
  an agent move within 120 ms of a hand move counted as the hand's, and so did its click). Hovers while
  the developer's mouse moves are still not lit, nor is an agent click within 200 px of the moving pointer;
  a developer who clicks within a frame of a flick that long would be taken for the agent.
  Found with real Claude in Chrome traces, recorded in `test/traces/` and replayed in tests through
  Chrome's input layer. The skill notes what is not drawn (`javascript_tool` clicks, keys outside a field,
  scrolls), waits for the page to load before the first step, and never stashes, resets or checks out the
  developer's work to show the old behaviour.
- CI: the Playwright tests run on every pull request and on pushes to `main` (GitHub Actions).
- Issue templates (bug report, feature request) and a pull request template.
- Positioning fixes (#7): outlines and badges land on their target when a page sets CSS `zoom` on its
  root; an overlay left by an earlier copy of the script (after the extension is reloaded or updated) is
  removed, and that old copy stops drawing; the overlay's own styles are `!important`, so page CSS cannot
  hide it; a click inside a container too large to outline outlines the clicked element.
- Needs Chrome 128 or later (was 121): the zoom fix relies on standardised CSS zoom.
- The agent can check what was drawn (#6): the overlay keeps an in-memory log of this page's hovers,
  clicks, typing and steps, and who did them (role and label or visible text only, never what was typed or
  text inside a field or editable element; newest 200), answers each step event with what it drew
  (`data-last`), writes the log on request (`log: true`, `data-log`) and its version (`data-version`). The
  skill checks the version, reads back each step, and cites a log entry and a screenshot for every Pass in
  the report; anything without one goes under Not checked.
- Step badges land on the right element (#5): a step event can name its own target with `selector` (or
  `at: { x, y }` in the page's CSS pixels); a new step with nothing lit since the last one shows in the
  corner toast instead of on the previous step's element; a target that is not found also goes to the
  toast; every step event raises the overlay above a dialog or popover opened by the agent's click. The
  skill sends a `selector` (Claude in Chrome's coordinates are scaled screenshot pixels, so they are not
  used as `at`).

## 0.1.1 (2026-10-29)

- New icon: a white pointer acting on a red-outlined target, the overlay itself. Replaces the red ring,
  which looked like a record button. The 16px toolbar icon has its own bolder drawing.

## 0.1.0 (2026-10-29)

First release.


- Overlay: spotlight on the agent's hover, ripple and outline on clicks, outline on typing after the
  agent's own hover or click, step badge, finding label, corner toast. The developer's own mouse and
  typing are left alone unless "show my own clicks" is on.
- Popup: enable or remove other sites, voice settings, "show my own clicks".
- Voice through `chrome.tts`, off by default: only the tab in front speaks, rate limited, queue capped,
  Alt+Shift+S stops it.
- Skill for Claude Code (Claude in Chrome), packaged as a plugin.
- Playwright tests for the overlay, the popup and site registration (36).
