# Changelog

## 0.1.0 (unreleased)

- Overlay: spotlight on the agent's hover, ripple and outline on clicks, outline on typing after the
  agent's own hover or click, step badge, finding label, corner toast. The developer's own mouse and
  typing are left alone unless "show my own clicks" is on.
- Popup: enable or remove other sites, voice settings, "show my own clicks".
- Voice through `chrome.tts`, off by default: only the tab in front speaks, rate limited, queue capped,
  Alt+Shift+S stops it.
- Skill for Claude Code (Claude in Chrome), packaged as a plugin.
- Playwright tests for the overlay, the popup and site registration (36).
