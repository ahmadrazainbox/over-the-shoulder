# Privacy

Over the Shoulder draws on the page. It does not collect, store or send anything about the pages you
visit or what you do on them.

- It never reads the values of fields, and never looks at which key was pressed. It only notes *that* an
  element was hovered, clicked or typed into, so it can outline it.
- It has no server, no analytics and makes no network requests.
- Its only stored data is your settings (voice on or off, voice, speed, mode, "show my own clicks") in
  Chrome's extension storage on your computer. The sites you enable are held by Chrome as ordinary
  extension permissions. While you enable a site, the tab and site are kept in session storage so the
  overlay can be added to that tab; this is removed once used, ignored after two minutes, and never kept
  past the browser session.
- **Voice:** spoken lines are passed to Chrome's text-to-speech and not stored. Voices marked **online**
  in the popup are provided by Google, and the text they read is sent to Google to be spoken. Offline
  (system) voices keep everything on your computer.

It runs only on `localhost`, `127.0.0.1`, `*.test`, and the sites you enable yourself.
