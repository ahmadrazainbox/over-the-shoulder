# Changelog

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
