// Records the input events a page receives, to capture how a browser agent's actions really arrive.
// Run it on the test page (for example with Claude in Chrome's javascript_tool), act, then read
// JSON.stringify(window.__otsTrace). Times, coordinates, targets and isTrusted only: printable keys and
// field values are never kept.
(() => {
  if (window.__otsTrace) { return 'already recording'; }
  const trace = { started: new Date().toISOString(), userAgent: navigator.userAgent,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, events: [] };
  window.__otsTrace = trace;
  const t0 = performance.now();
  const name = (el) => {
    if (!(el instanceof Element)) { return el === document ? 'document' : String(el?.constructor?.name || ''); }
    return el.id ? `#${el.id}` : el.tagName.toLowerCase();
  };
  const types = ['pointerover', 'pointerenter', 'pointermove', 'pointerdown', 'pointerup', 'mousemove', 'mousedown',
    'mouseup', 'click', 'keydown', 'keyup', 'beforeinput', 'input', 'change', 'focusin', 'wheel', 'scroll'];
  for (const type of types) {
    addEventListener(type, (e) => {
      const row = { t: Math.round((performance.now() - t0) * 10) / 10, type, trusted: e.isTrusted, target: name(e.target) };
      if ('clientX' in e) {
        Object.assign(row, { x: e.clientX, y: e.clientY, mx: e.movementX, my: e.movementY, buttons: e.buttons });
        if (e.pointerType !== undefined) { row.pointer = e.pointerType; }
      }
      if (e.key !== undefined) { row.key = [...e.key].length === 1 ? 'char' : e.key; }
      if (e.inputType !== undefined) { row.inputType = e.inputType; }
      if (type === 'scroll') { row.scrollY = scrollY; }
      if (type === 'wheel') { Object.assign(row, { dx: e.deltaX, dy: e.deltaY }); }
      trace.events.push(row);
    }, { capture: true, passive: true });
  }
  return 'recording';
})();
