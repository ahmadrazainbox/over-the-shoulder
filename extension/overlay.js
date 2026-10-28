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
// It draws only. It reads no field values, never looks at which key was pressed, and stores nothing.
//
// Agents add a step number, a label for a finding, or a line to speak, by running this in the page
// (detail is a JSON string because the page and this script run in separate JavaScript worlds):
//   window.dispatchEvent(new CustomEvent('over-the-shoulder', { detail: JSON.stringify({ step: 4, label: 'Total is wrong', say: 'Watch the total.' }) }))
// Only the top window listens, so a target inside an iframe gets no badge; the step shows as a toast.
(() => {
  if (window.__overTheShoulder) { return; }
  window.__overTheShoulder = true;

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
  host.style.cssText = 'all:initial;position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;'
    + 'background:transparent;overflow:visible;pointer-events:none;z-index:2147483647;display:block;';
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
  // <dialog> or popover; z-index alone cannot rise above those. Raised again on each new step only.
  if ('popover' in host) { host.popover = 'manual'; }
  const raise = () => {
    if (!host.isConnected) { document.documentElement.append(host); }
    try { host.hidePopover?.(); host.showPopover?.(); } catch { /* not supported or not connected */ }
  };

  // The element worth lighting: the button, link or field around what was hit, not the <span> inside a
  // button, and never the whole page. Large editors are allowed; other huge boxes are not.
  const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],'
    + '[role=menuitem],[role=option],[role=checkbox],[role=switch],[role=radio],[contenteditable]:not([contenteditable=false]),td,th,li';
  const editable = (el) => el instanceof Element && (el.matches('input,textarea,select') || el.isContentEditable);
  const pick = (el) => {
    if (!(el instanceof Element) || el === host) { return null; }
    const chosen = el.closest(INTERACTIVE) || el;
    if (chosen === document.body || chosen === document.documentElement) { return null; }
    const r = chosen.getBoundingClientRect();
    if (!editable(chosen) && r.width * r.height > (innerWidth * innerHeight) / 2) { return null; }
    return chosen;
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
    const r = target.getBoundingClientRect();
    const key = `${r.left}|${r.top}|${r.width}|${r.height}|${innerWidth}|${innerHeight}|${shown(label)}`;
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
  const loop = () => { draw(); follow = target ? requestAnimationFrame(loop) : 0; };

  function end() {
    target = null;
    last = '';
    cancelAnimationFrame(follow);
    clearTimeout(liftTimer);
    clearTimeout(endTimer);
    [spot, badge, label].forEach(hide);
    spot.classList.remove('lifted', 'quiet');
  }

  // quiet: a click or typing. An outline only, no dim and no pulse; the step number stays.
  const light = (el, x, y, { quiet = false } = {}) => {
    const chosen = pick(el);
    if (!chosen) { return; }
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
    if (!isTop) { try { window.top.postMessage({ overTheShoulder: 'lit' }, '*'); } catch { /* detached */ } }
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
  // own last spot, are ignored. Hover lighting is best effort; clicks are the reliable signal.
  let loadedAt = performance.now();
  let lastMoveAt = -Infinity;
  let streak = 0;
  let hand = null;
  let agent = null;
  let litByMoveAt = -Infinity;
  // Who last pointed at or clicked something: typing is shown only after the agent's own hover or click,
  // so the developer's typing is not outlined (unless "show my own clicks" is on). Nobody, after a load.
  let actor = null;
  let actedAt = -Infinity;
  const acted = (who) => { actor = who; actedAt = performance.now(); };
  const near = (p, e, r) => p && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= r;
  addEventListener('pointermove', (e) => {
    if (!e.isTrusted) { return; }
    const now = performance.now();
    const lone = now - lastMoveAt > 120;
    lastMoveAt = now;
    streak = lone ? 1 : streak + 1;
    const moved = Math.hypot(e.movementX, e.movementY);
    if (!lone && moved > 0 && now - litByMoveAt < 250) {
      // The "hover" just lit was the start of a hand stream; agents send one move, not a stream.
      litByMoveAt = -Infinity;
      if (actor === 'agent') { actor = 'hand'; }
      end();
    }
    if (!lone || (moved > 0 && moved <= 80) || near(hand, e, 60)) { hand = { x: e.clientX, y: e.clientY, streak }; return; }
    if (moved === 0 && (now - loadedAt < 1000 || near(agent, e, 20))) { return; }
    agent = { x: e.clientX, y: e.clientY };
    acted('agent');
    litByMoveAt = now;
    light(hit(e), e.clientX, e.clientY);
  }, true);

  // A click is the developer's own when it lands where their hand has been moving (a stream of moves, not
  // one lone hop, which is how a Playwright click arrives). Those are skipped unless "show my clicks" is on.
  addEventListener('pointerdown', (e) => {
    if (!e.isTrusted) { return; }
    const mine = near(hand, e, 4) && hand.streak >= 3;
    acted(mine ? 'hand' : 'agent');
    if (mine && !showMine) { return; }
    if (!mine) { agent = { x: e.clientX, y: e.clientY }; }
    const ripple = part('ripple');
    Object.assign(ripple.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
    setTimeout(() => ripple.remove(), 1000);
    raise();
    light(hit(e), e.clientX, e.clientY, { quiet: true });
  }, true);

  // Typing: an outline on the field being typed into, after the agent's own last action (the developer's
  // typing is skipped unless "show my own clicks" is on). Key presses and text inserted in one go
  // (Playwright fill, Input.insertText) are trusted events. A value set by a script and then announced
  // with input/change (an agent's form-filling tool, Playwright selectOption) is untrusted, so it counts
  // only within a few seconds of an agent action, not whenever the page fires such events itself. The key
  // and the value are never looked at.
  const typed = (e) => {
    if (actor !== 'agent' && !showMine) { return; }
    if (!e.isTrusted && performance.now() - actedAt > 5000) { return; }
    const el = hit(e);
    if (!editable(el)) { return; }
    const r = el.getBoundingClientRect();
    light(el, r.left + r.width / 2, r.top + r.height / 2, { quiet: true });
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
    if (e.data?.overTheShoulder === 'lit' && ownFrame(window, e.source, 0)) { end(); }
  });

  // Step numbers, finding labels and spoken lines from the agent. With nothing lit (the target is in an
  // iframe, or the agent has not hovered), the step and label show as a toast in the corner instead.
  let saidAt = -Infinity;
  addEventListener(EVENT, (e) => {
    let detail = {};
    try { detail = JSON.parse(typeof e.detail === 'string' ? e.detail : '{}') || {}; } catch { return; }
    const step = detail.step === undefined || detail.step === null ? '' : String(detail.step).slice(0, 4);
    const text = detail.label ? String(detail.label).slice(0, 200) : '';
    if (detail.say && performance.now() - saidAt > 250) {
      saidAt = performance.now();
      try { chrome.runtime.sendMessage({ type: 'say', text: String(detail.say).slice(0, 300) }); } catch { /* reloaded */ }
    }
    if (!step && !text) { return; }
    if (!target) {
      toast.replaceChildren();
      if (step) { toast.append(Object.assign(document.createElement('b'), { textContent: step })); }
      if (text) { toast.append(document.createTextNode(text)); }
      raise();
      show(toast);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => hide(toast), text ? 8000 : 4000);
      return;
    }
    if (step) { badge.textContent = step; show(badge); }
    // A finding stays beside its target until the next element is lit, so it can be read.
    if (text) {
      label.textContent = text;
      show(label);
    }
    last = '';
    draw();
  });
})();
