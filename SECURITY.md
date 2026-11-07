# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue: open the repository's **Security** tab
and choose **Report a vulnerability** (GitHub private vulnerability reporting). Fixes are released as a new
version, with credit to the reporter unless they prefer otherwise.

Only the latest release is supported.

## What the extension can and cannot do

Over the Shoulder draws on pages; it does not read field values or keys, and it makes no network requests
(an "online" voice, if you choose one, is spoken by Chrome and Google; see [PRIVACY.md](PRIVACY.md)).

By design, these are **not** vulnerabilities:

- Any script on a page where the overlay runs can send the step event, draw look-alike marks, have a line
  spoken (only if you switched voice on), and read or change the overlay's log on that page. Treat the
  overlay as a guide to follow the agent, not as proof of what it did, and enable it only on sites you trust.
- It runs on `localhost`, `127.0.0.1` and `*.test` by default, and on another site only after you enable it
  there from the popup.

Please do report anything that lets a page read what was typed, reach another site or tab, run code in the
extension, or change its settings.
