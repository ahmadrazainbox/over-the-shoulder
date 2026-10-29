# Privacy

Over the Shoulder draws on the page. It does not collect, store or send anything about the pages you
visit or what you do on them, beyond the short in-page list described below.

- It never reads the values of fields, and never looks at which key was pressed. It only notes *that* an
  element was hovered, clicked or typed into, so it can outline it.
- While a page is open, it keeps a short list in memory of what it drew on that page: the action (hover,
  click, typing, step), who did it (the agent or you, when "show my own clicks" is on), the element's role
  and its label or visible text (for example `button "Save"`; this can include text the page itself
  shows), and the time. Never a field's value, a key, or text inside a field or an editable element. The agent reads it back to check its
  report. The list is written on the overlay's own element in the page, so the page's own scripts can
  read it too; it only names elements of that same page. It is gone when the page is closed or reloaded,
  and holds at most 200 entries.
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
