// Over the Shoulder: shows where an AI agent's browser actions land, so the developer can follow along.
//
// Browser agents (Claude in Chrome, Playwright, Puppeteer, Chrome DevTools MCP) send real, trusted input
// events without moving the visible mouse pointer. This script draws from those events rather than
// predicting a target:
// - a hover lights the target: the rest of the page dims for a moment while it glows, then a soft
//   outline stays until the step is over;
// - a click leaves a ripple and an outline;
// - typing (key presses, or text inserted in one go) outlines the field.
//
// It draws only. It reads no field values, never looks at which key was pressed, and stores nothing; it
// keeps a short in-memory list of what it drew (element role and visible name), which the agent can read
// back to check its report.
//
// Agents add a step number, a label for a finding, or a line to speak, by running this in the page
// (detail is a JSON string because the page and this script run in separate JavaScript worlds):
//   window.dispatchEvent(new CustomEvent('over-the-shoulder', { detail: JSON.stringify({ step: 4, label: 'Total is wrong', say: 'Watch the total.', at: { x: 640, y: 320 } }) }))
// `at` (where the agent just hovered or clicked) or `selector` names the step's own target.
// Only the top window listens, so a target inside an iframe gets no badge; the step shows as a toast.
(() => {
  if (window.__overTheShoulder) { return; }
  window.__overTheShoulder = true;
  // An overlay left by an earlier copy of this script (the extension was reloaded or updated, and the
  // tab got the new copy) is removed, so there is only ever one.
  document.querySelectorAll('[data-over-the-shoulder]').forEach((old) => old.remove());

  const EVENT = 'over-the-shoulder';
  const DIM_MS = 1500;
  // The outline stays until the agent's next action, since an agent's step (hover, step event, act,
  // screenshot) often takes longer than a few seconds; this is only a safety limit.
  const STAY_MS = 60000;
  const isTop = window.top === window;

  let showMine = false;
  try {
    chrome.storage.local.get({ showMine: false }, (s) => { showMine = Boolean(s?.showMine); });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.showMine) { showMine = Boolean(changes.showMine.newValue); }
    });
  } catch { /* extension reloaded; keep the default */ }

  // Everything lives in one shadow root, so the page's CSS cannot reach it and a strict style-src CSP
  // cannot block it (constructed stylesheets and CSSOM writes are not inline style markup).
  const host = document.createElement('div');
  host.setAttribute('data-over-the-shoulder', '');
  // Every rule is !important, so a page rule such as `div { display: none !important }` cannot hide it.
  host.style.cssText = ['all:initial', 'position:fixed', 'inset:0', 'width:100vw', 'height:100vh', 'margin:0',
    'padding:0', 'border:0', 'background:transparent', 'overflow:visible', 'pointer-events:none',
    'z-index:2147483647', 'display:block', 'visibility:visible', 'opacity:1', 'transform:none', 'filter:none']
    .map((rule) => `${rule} !important`).join(';');
  const root = host.attachShadow({ mode: 'open' });
  const css = `
    * { box-sizing: border-box; }
    .spot, .ripple, .label, .badge, .toast { position: absolute; pointer-events: none; display: none; }
    .spot { border-radius: 8px; border: 3px solid #E10600;
      box-shadow: 0 0 0 9999px rgba(15,23,32,.35), 0 0 0 4px rgba(225,6,0,.25), 0 0 18px 4px rgba(225,6,0,.55);
      transition: box-shadow .6s ease, border-color .6s ease; animation: pulse 1.1s ease-in-out infinite; }
    /* The outline that stays: full red with a thin light rim, so it reads on dark pages as well as light. */
    .spot.lifted, .spot.quiet { animation: none; border-color: #FF2A1F;
      box-shadow: 0 0 0 9999px rgba(15,23,32,0), 0 0 0 1px rgba(255,255,255,.55), 0 0 10px 2px rgba(225,6,0,.45); }
    .spot.quiet { transition: none; }
    @keyframes pulse { 50% { border-color: rgba(225,6,0,.45); } }
    .badge { min-width: 24px; height: 24px; padding: 0 6px; border-radius: 12px; background: #E10600; color: #fff;
      font: 700 13px/24px system-ui, sans-serif; text-align: center; box-shadow: 0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.35); }
    .ripple { width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 3px solid #E10600;
      display: block; animation: ripple .9s ease-out forwards; }
    @keyframes ripple { to { transform: scale(5); opacity: 0; } }
    .label, .toast { max-width: min(380px, calc(100vw - 16px)); padding: 6px 10px; border-radius: 8px;
      background: #14202B; color: #fff; font: 600 13px/1.35 system-ui, sans-serif;
      border: 1px solid rgba(255,255,255,.4); border-left: 4px solid #E10600; box-shadow: 0 4px 14px rgba(0,0,0,.35); }
    .toast { right: 16px; bottom: 16px; }
    .toast b { display: inline-block; min-width: 20px; margin-right: 6px; padding: 0 6px; border-radius: 10px;
      background: #E10600; text-align: center; }
  `;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } catch {
    root.append(Object.assign(document.createElement('style'), { textContent: css }));
  }
  const part = (className) => root.appendChild(Object.assign(document.createElement('div'), { className }));
  const spot = part('spot');
  const badge = part('badge');
  const label = part('label');
  const toast = part('toast');
  const shown = (el) => el.style.display === 'block';
  const show = (el) => { el.style.display = 'block'; };
  const hide = (el) => { el.style.display = 'none'; };

  // Shown as a manual popover where it can be, so it sits in the browser's top layer, above a native
  // <dialog> or popover; z-index alone cannot rise above those. Raised again on each new target and on
  // every step event.
  if ('popover' in host) { host.popover = 'manual'; }
  // A page that sets CSS zoom on its root would scale the overlay too, while element boxes are measured in
  // the viewport's own pixels (standardised zoom, Chrome 128 and later); the overlay undoes that zoom so the
  // two match. Checked again while drawing, for a page that changes its zoom.
  let fitted = '';
  const fit = () => {
    fitted = getComputedStyle(document.documentElement).zoom;
    host.style.setProperty('zoom', String(1 / (parseFloat(fitted) || 1)), 'important');
  };
  const raise = () => {
    if (!host.isConnected) { document.documentElement.append(host); }
    fit();
    try { host.hidePopover?.(); host.showPopover?.(); } catch { /* not supported or not connected */ }
  };

  // The element worth lighting: the button, link or field around what was hit, not the <span> inside a
  // button, and never the whole page. Large editors are allowed; other huge boxes are not.
  const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],'
    + '[role=menuitem],[role=option],[role=checkbox],[role=switch],[role=radio],[contenteditable]:not([contenteditable=false]),td,th,li';
  const editable = (el) => el instanceof Element && (el.matches('input,textarea,select') || el.isContentEditable);
  const fits = (node) => {
    if (node === document.body || node === document.documentElement) { return false; }
    const r = node.getBoundingClientRect();
    return editable(node) || r.width * r.height <= (innerWidth * innerHeight) / 2;
  };
  // A button, link or row too large to outline (a list item taller than the screen): the element that
  // was hit, if that one is small enough.
  const pick = (el) => {
    if (!(el instanceof Element) || el === host) { return null; }
    const chosen = el.closest(INTERACTIVE) || el;
    if (fits(chosen)) { return chosen; }
    return chosen !== el && fits(el) ? el : null;
  };
  // The real target, inside an open shadow root if there is one, not its host.
  const hit = (e) => e.composedPath?.()[0] ?? e.target;
  const deepAt = (x, y) => {
    let el = document.elementFromPoint(x, y);
    while (el?.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) { break; }
      el = inner;
    }
    return el;
  };

  let target = null;
  // How many times something has been lit, so a step can tell whether anything was lit since the last one.
  let lights = 0;
  let at = { x: 0, y: 0 };
  let follow = 0;
  let last = '';
  let liftTimer;
  let endTimer;
  let toastTimer;

  // Follows the element every frame while lit, so it stays on it when the page scrolls, writing only when
  // the box has moved. If a framework replaces the element, the one now under the same spot takes over.
  const draw = () => {
    if (target && !target.isConnected) {
      const replacement = pick(deepAt(at.x, at.y));
      if (!replacement) { end(); return; }
      target = replacement;
      last = '';
    }
    if (!target) { return; }
    if (getComputedStyle(document.documentElement).zoom !== fitted) { fit(); }
    const r = target.getBoundingClientRect();
    const key = `${r.left}|${r.top}|${r.width}|${r.height}|${innerWidth}|${innerHeight}|${shown(label)}|${fitted}`;
    if (key === last) { return; }
    last = key;
    Object.assign(spot.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    Object.assign(badge.style, { left: `${Math.min(r.right + 2, innerWidth - 32)}px`, top: `${Math.max(4, r.top - 16)}px` });
    if (shown(label)) {
      const h = label.offsetHeight;
      const below = r.bottom + 12 + h < innerHeight;
      Object.assign(label.style, {
        left: `${Math.max(8, Math.min(r.left, innerWidth - label.offsetWidth - 8))}px`,
        top: `${below ? r.bottom + 12 : Math.max(8, r.top - h - 12)}px`,
      });
    }
  };
  // Stops at once when this copy has lost the extension, so an outline it drew does not linger.
  const loop = () => {
    if (gone()) { return; }
    draw();
    follow = target ? requestAnimationFrame(loop) : 0;
  };

  function end() {
    target = null;
    last = '';
    cancelAnimationFrame(follow);
    clearTimeout(liftTimer);
    clearTimeout(endTimer);
    [spot, badge, label].forEach(hide);
    spot.classList.remove('lifted', 'quiet');
  }

  // What was drawn, so the agent can check its report against it (the step event's `log`). Each entry names
  // the element by role and visible name only; a field's value, a key, or an editable element's text is
  // never read. Kept in memory for this page only, newest 200.
  const VERSION = (() => { try { return chrome.runtime.getManifest().version; } catch { return ''; } })();
  host.dataset.version = VERSION;
  const ROLES = { A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox', LI: 'listitem', TD: 'cell',
    TH: 'columnheader', LABEL: 'label', SUMMARY: 'button', IFRAME: 'iframe', DIALOG: 'dialog' };
  const INPUTS = { checkbox: 'checkbox', radio: 'radio', button: 'button', submit: 'button', reset: 'button', range: 'slider' };
  const NAMED_BY_TEXT = new Set(['link', 'button', 'label', 'heading', 'listitem', 'cell', 'columnheader',
    'rowheader', 'option', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'checkbox', 'radio', 'switch',
    'treeitem']);
  const clip = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  // The words of a node, skipping anything a person can type into (an editable element, a field, a select and
  // its options), so typed text never becomes part of a name.
  const safeText = (node) => {
    if (node.nodeType === Node.TEXT_NODE) { return node.textContent; }
    if (!(node instanceof Element) || editable(node) || node.matches('select,option,input,textarea,script,style')) { return ''; }
    return [...node.childNodes].map(safeText).join(' ');
  };
  const describe = (el) => {
    if (!(el instanceof Element)) { return ''; }
    const tag = el.tagName;
    const role = el.getAttribute('role') || (tag === 'INPUT' ? INPUTS[el.type] || 'textbox' : ROLES[tag])
      || (/^H[1-6]$/.test(tag) ? 'heading' : tag.toLowerCase());
    // A text box without contenteditable (an ARIA widget) counts as a field too.
    const field = editable(el) || /^(textbox|searchbox|spinbutton|combobox)$/.test(el.getAttribute('role') || '');
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    const referred = ids.map((id) => el.getRootNode().getElementById?.(id)).filter((node) => node && node !== el);
    const name = el.getAttribute('aria-label')
      || referred.map(safeText).join(' ')
      || (el.labels?.[0] ? safeText(el.labels[0]) : '')
      // A button input's caption is set by the page, not typed.
      || (tag === 'INPUT' && INPUTS[el.type] === 'button' ? el.value : '')
      || el.getAttribute('alt') || el.getAttribute('placeholder')
      // Pages sometimes copy a field's value into its title, so a field's title is not read.
      || (field ? '' : el.getAttribute('title'))
      // Visible text only for elements that are named by it. A plain div, span or pre can be where a code
      // editor or terminal draws what was typed (its keys go to a hidden field), so those get no text.
      || (field || !NAMED_BY_TEXT.has(role) ? '' : safeText(el));
    return clip(name) ? `${role} "${clip(name)}"` : role;
  };
  const log = [];
  let logged = 0;
  let typedIn = null;
  const record = (entry, el = null) => {
    const prev = log[log.length - 1];
    // Typing fires on every key: one entry per field (the same element, not just the same name).
    if (entry.action === 'type' && prev?.action === 'type' && typedIn === el) {
      prev.t = Math.round(performance.now());
      prev.trusted = prev.trusted || entry.trusted;
      return prev;
    }
    typedIn = entry.action === 'type' ? el : null;
    const full = { n: ++logged, t: Math.round(performance.now()), ...entry };
    log.push(full);
    if (log.length > 200) { log.shift(); }
    return full;
  };

  // quiet: a click or typing. An outline only, no dim and no pulse; the step number stays.
  const light = (el, x, y, { quiet = false, action = '', trusted = true, by = 'agent' } = {}) => {
    const chosen = pick(el);
    if (!chosen) { return; }
    const entry = action ? record({ action, on: describe(chosen), trusted, by }, chosen) : null;
    const same = chosen === target;
    if (!same) { raise(); hide(badge); hide(label); }
    target = chosen;
    at = { x, y };
    last = '';
    spot.classList.toggle('quiet', quiet);
    spot.classList.remove('lifted');
    show(spot);
    cancelAnimationFrame(follow);
    loop();
    clearTimeout(liftTimer);
    clearTimeout(endTimer);
    if (!quiet) { liftTimer = setTimeout(() => spot.classList.add('lifted'), DIM_MS); }
    endTimer = setTimeout(end, STAY_MS);
    lights++;
    if (!isTop) { try { window.top.postMessage({ overTheShoulder: 'lit' }, '*'); } catch { /* detached */ } }
    return entry;
  };

  // After the extension is reloaded or updated, this copy loses its connection to it. It then removes its
  // overlay and does nothing more, instead of drawing beside the new copy.
  let dead = false;
  const gone = () => {
    if (dead) { return true; }
    let alive = false;
    try { alive = Boolean(chrome.runtime?.id); } catch { /* invalidated */ }
    if (alive) { return false; }
    dead = true;
    end();
    host.remove();
    return true;
  };

  // Telling the agent's pointer from the developer's own mouse (they share one pointer):
  // - a hand sends a stream of moves, many per second, each a few pixels;
  // - an agent's hover is a single move with nothing just before it: either no movement at all, or one
  //   jump straight to the target;
  // - Chrome also sends still moves from where the real cursor rests (after a load or a scroll), and
  //   repeats still moves from where the agent's pointer was left after the page changes.
  // So: a move landing near where the hand last was is the hand's, however large its step; a move that is
  // part of a stream is the hand's; a lone small step is treated as the hand's too (a short agent hop is
  // missed, but its click still shows); still moves in the first second after a load, or at the agent's
  // own last spot, are ignored. A lone move within 4px of where the hand rests after a stream is the hand
  // settling (a mouse button nudges the pointer as it is pressed), so the stream goes on. A move outside
  // the page (the pointer below it, over the browser's own bar) is never lit. Hover lighting is best
  // effort; clicks are the reliable signal.
  let loadedAt = performance.now();
  let lastMoveAt = -Infinity;
  let streak = 0;
  let hand = null;
  let movedTo = null;
  let jumpedAt = -Infinity;
  let agent = null;
  let litByMoveAt = -Infinity;
  let litByMove = null;
  // Who last pointed at or clicked something: typing is shown only after the agent's own hover or click,
  // so the developer's typing is not outlined (unless "show my own clicks" is on). Nobody, after a load.
  let actor = null;
  let actedAt = -Infinity;
  const acted = (who) => { actor = who; actedAt = performance.now(); };
  const near = (p, e, r) => p && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= r;
  addEventListener('pointermove', (e) => {
    if (gone() || !e.isTrusted) { return; }
    const now = performance.now();
    const lone = now - lastMoveAt > 120;
    lastMoveAt = now;
    // A move back to where the hand rests is no jump, even straight after the agent's pointer was elsewhere.
    jumpedAt = near(movedTo, e, 200) || near(hand, e, 4) ? -Infinity : e.timeStamp;
    // Chrome repeats still moves at exactly the same spot (where the agent's pointer was left, after the
    // page changes): those are not a hand moving, so they do not add to its stream.
    const repeat = movedTo?.x === e.clientX && movedTo?.y === e.clientY;
    movedTo = { x: e.clientX, y: e.clientY };
    streak = !lone ? streak + (repeat ? 0 : 1) : (hand?.streak >= 3 && near(hand, e, 4) ? hand.streak : 1);
    const moved = Math.hypot(e.movementX, e.movementY);
    if (!lone && moved > 0 && now - litByMoveAt < 250) {
      // The "hover" just lit was the start of a hand stream; agents send one move, not a stream.
      litByMoveAt = -Infinity;
      if (actor === 'agent') { actor = 'hand'; }
      end();
      // Nor is it left in the log, unless something was recorded after it.
      if (litByMove && log.at(-1) === litByMove) { log.pop(); logged--; }
      litByMove = null;
    }
    if (!lone || (moved > 0 && moved <= 80) || near(hand, e, 60)) { hand = { x: e.clientX, y: e.clientY, streak }; return; }
    if (moved === 0 && (now - loadedAt < 1000 || near(agent, e, 20))) { return; }
    if (e.clientX < 0 || e.clientY < 0 || e.clientX > innerWidth || e.clientY > innerHeight) { return; }
    agent = { x: e.clientX, y: e.clientY };
    acted('agent');
    litByMoveAt = now;
    litByMove = light(hit(e), e.clientX, e.clientY, { action: 'hover' });
  }, true);

  // A click is the developer's own when it lands where their hand has been moving (a stream of moves, not
  // one lone hop, which is how a Playwright click arrives). Those are skipped unless "show my clicks" is on.
  // But a press within 40 ms (by input time, so a busy page cannot squeeze the gap) of a move that jumped
  // more than 200px is the agent's, even in the middle of the developer's own stream (they can move their
  // mouse while the agent acts). In real traces Claude in Chrome pressed 0.5 to 20 ms after its one move,
  // which landed 400px or more from the developer's pointer; of about 1,400 hand steps none was over 200px,
  // and the developer's presses came 100 ms or more after any such step. A developer who clicks within
  // 40 ms of such a flick is taken for the agent; an agent click landing within 200px of the moving hand,
  // or within 4px of where the developer's pointer rests, is missed.
  addEventListener('pointerdown', (e) => {
    if (gone() || !e.isTrusted) { return; }
    const mine = e.timeStamp - jumpedAt >= 40 && near(hand, e, 4) && hand.streak >= 3;
    acted(mine ? 'hand' : 'agent');
    if (mine && !showMine) { return; }
    if (!mine) { agent = { x: e.clientX, y: e.clientY }; }
    const ripple = part('ripple');
    Object.assign(ripple.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
    setTimeout(() => ripple.remove(), 1000);
    raise();
    light(hit(e), e.clientX, e.clientY, { quiet: true, action: 'click', by: mine ? 'hand' : 'agent' });
  }, true);

  // Typing: an outline on the field being typed into, after the agent's own last action (the developer's
  // typing is skipped unless "show my own clicks" is on). Key presses and text inserted in one go
  // (Playwright fill, Input.insertText) are trusted events. A value set by a script and then announced
  // with input/change (an agent's form-filling tool, Playwright selectOption) is untrusted, so it counts
  // only within a few seconds of an agent action, not whenever the page fires such events itself. The key
  // and the value are never looked at.
  const typed = (e) => {
    if (gone()) { return; }
    if (actor !== 'agent' && !showMine) { return; }
    if (!e.isTrusted && performance.now() - actedAt > 5000) { return; }
    const el = hit(e);
    if (!editable(el)) { return; }
    const r = el.getBoundingClientRect();
    light(el, r.left + r.width / 2, r.top + r.height / 2, { quiet: true, action: 'type', trusted: e.isTrusted, by: actor === 'agent' ? 'agent' : 'hand' });
  };
  addEventListener('keydown', (e) => { if (e.isTrusted) { typed(e); } }, true);
  addEventListener('input', typed, true);
  addEventListener('change', typed, true);

  // A page that changes without a reload would otherwise keep a spotlight on an element now elsewhere.
  // Cleared a moment later, so the click that caused the navigation is still seen.
  const endSoon = () => { clearTimeout(endTimer); endTimer = setTimeout(end, 600); };
  addEventListener('popstate', endSoon);
  addEventListener('pageshow', (e) => { if (e.persisted) { end(); loadedAt = performance.now(); } });
  document.addEventListener('inertia:navigate', endSoon);
  window.navigation?.addEventListener?.('navigate', endSoon);

  if (!isTop) { return; }

  const ownFrame = (parent, source, depth) => {
    if (!source || depth > 5) { return false; }
    for (let i = 0; i < parent.length; i++) {
      try { if (parent[i] === source || ownFrame(parent[i], source, depth + 1)) { return true; } } catch { /* gone */ }
    }
    return false;
  };
  // An agent action inside an iframe: the top page's outline is now stale, and the next step badge
  // belongs in the corner toast, not on it.
  addEventListener('message', (e) => {
    if (gone()) { return; }
    if (e.data?.overTheShoulder === 'lit' && ownFrame(window, e.source, 0)) { end(); }
  });

  // Step numbers, finding labels and spoken lines from the agent. With nothing lit (the target is in an
  // iframe, or the agent has not hovered), the step and label show as a toast in the corner instead.
  // A step can name its own target, so its badge never lands on the element of the step before (a short
  // hover hop between neighbouring fields is not lit): `selector` (CSS, first match in the top page) or
  // `at` ({ x, y } in the viewport's CSS pixels, where the agent just hovered or clicked).
  const named = (detail) => {
    if (typeof detail.selector === 'string' && detail.selector) {
      try { return document.querySelector(detail.selector.slice(0, 300)); } catch { return null; }
    }
    const x = Number(detail.at?.x);
    const y = Number(detail.at?.y);
    return Number.isFinite(x) && Number.isFinite(y) ? deepAt(x, y) : null;
  };
  // The step last shown on a target, and the light count at the time.
  let shownStep = { step: '', lights: -1 };
  let saidAt = -Infinity;
  addEventListener(EVENT, (e) => {
    if (gone()) { return; }
    // Cleared first, so an event that draws nothing never leaves the previous step's answer to be read.
    delete host.dataset.last;
    let detail = {};
    try { detail = JSON.parse(typeof e.detail === 'string' ? e.detail : '{}') || {}; } catch { return; }
    const step = detail.step === undefined || detail.step === null ? '' : String(detail.step).slice(0, 4);
    const text = detail.label ? String(detail.label).slice(0, 200) : '';
    if (detail.say && performance.now() - saidAt > 250) {
      saidAt = performance.now();
      try { chrome.runtime.sendMessage({ type: 'say', text: String(detail.say).slice(0, 300) }); } catch { /* reloaded */ }
    }
    // The answer is written on the overlay's own element, where the agent reads it after sending:
    // `data-last` (what this step drew), `data-log` (every entry, on request), `data-version`.
    // Written once this event's own step is recorded, so the log includes it.
    const answer = (entry) => {
      if (entry) { host.dataset.last = JSON.stringify(entry); }
      if (detail.log) {
        if (!host.isConnected) { document.documentElement.append(host); }
        host.dataset.log = JSON.stringify(log);
      }
    };
    if (!step && !text) { answer(null); return; }
    // Every step comes to the front, above a dialog or popover the agent's last click may have opened.
    raise();
    if (detail.selector !== undefined || detail.at !== undefined) {
      const chosen = pick(named(detail));
      if (chosen) {
        const r = chosen.getBoundingClientRect();
        light(chosen, r.left + r.width / 2, r.top + r.height / 2, { quiet: true });
      } else {
        end();
      }
    } else if (target && step && step !== shownStep.step && lights === shownStep.lights) {
      // A new step with nothing lit since the last one: the lit element belongs to that step.
      end();
    }
    if (!target) {
      toast.replaceChildren();
      if (step) { toast.append(Object.assign(document.createElement('b'), { textContent: step })); }
      if (text) { toast.append(document.createTextNode(text)); }
      show(toast);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => hide(toast), text ? 8000 : 4000);
      answer(record({ action: 'step', step, on: 'toast', label: Boolean(text) }));
      return;
    }
    if (step) {
      badge.textContent = step;
      show(badge);
      shownStep = { step, lights };
    }
    // A finding stays beside its target until the next element is lit, so it can be read.
    if (text) {
      label.textContent = text;
      show(label);
    }
    last = '';
    draw();
    answer(record({ action: 'step', step, on: describe(target), label: Boolean(text) }));
  });
})();
