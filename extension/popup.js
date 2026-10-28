import { DEFAULTS, BUILT_IN, patternFor, isUserPattern } from './shared.js';

const $ = (id) => document.getElementById(id);

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function heldPatterns() {
  return ((await chrome.permissions.getAll()).origins || []).filter(isUserPattern).sort();
}

async function renderSite() {
  const tab = await currentTab();
  const pattern = tab?.url ? patternFor(tab.url) : null;
  const name = $('site-name');
  const status = $('site-status');
  const action = $('site-action');
  action.hidden = true;
  action.className = '';
  if (!pattern) {
    name.textContent = 'Not a web page';
    status.textContent = 'The overlay runs on http and https pages only.';
    return;
  }
  name.textContent = new URL(tab.url).hostname;
  if (BUILT_IN.test(pattern)) {
    status.textContent = 'Always on for local sites.';
    return;
  }
  const enabled = (await heldPatterns()).includes(pattern);
  status.textContent = enabled ? 'On. The overlay loads on every visit.' : 'Off. Tabs already open keep it until reloaded.';
  action.hidden = false;
  action.textContent = enabled ? 'Remove this site' : 'Enable on this site';
  if (!enabled) { action.className = 'primary'; }
  action.onclick = async () => {
    if (enabled) {
      await chrome.permissions.remove({ origins: [pattern] });
    } else {
      // The request must start in the click itself (Chrome needs the user gesture), so nothing is awaited
      // before it. The pending tab is stored alongside: Chrome's permission dialog can close this popup,
      // and the service worker then finishes the job when the permission arrives.
      chrome.storage.session.set({ pending: { tabId: tab.id, pattern, at: Date.now() } });
      const granted = await chrome.permissions.request({ origins: [pattern] });
      if (!granted) { await chrome.storage.session.remove('pending'); }
      if (granted) {
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['overlay.js'] });
        } catch { /* the service worker already did it, or the tab moved on */ }
      }
    }
    await render();
  };
}

async function renderSites() {
  const list = $('sites');
  list.replaceChildren();
  const patterns = await heldPatterns();
  if (!patterns.length) {
    list.append(Object.assign(document.createElement('li'), { className: 'muted', textContent: 'None yet.' }));
    return;
  }
  for (const pattern of patterns) {
    const item = document.createElement('li');
    const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Remove' });
    remove.onclick = async () => { await chrome.permissions.remove({ origins: [pattern] }); await render(); };
    item.append(pattern.replace(/\/\*$/, ''), remove);
    list.append(item);
  }
}

async function renderVoice() {
  const s = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  const voices = await chrome.tts.getVoices();
  const select = $('voice-name');
  select.length = 1;
  // Offline voices first; online ones are marked, because their text is sent to be spoken.
  voices
    .filter((v) => v.voiceName)
    .sort((a, b) => Number(Boolean(a.remote)) - Number(Boolean(b.remote)) || a.voiceName.localeCompare(b.voiceName))
    .forEach((v) => {
      const label = `${v.voiceName}${v.lang ? ` (${v.lang})` : ''}${v.remote ? ' · online' : ''}`;
      select.append(new Option(label, v.voiceName));
    });
  const remote = new Set(voices.filter((v) => v.remote).map((v) => v.voiceName));
  select.value = s.voiceName;
  $('voice').checked = s.voice;
  $('rate').value = s.rate;
  $('rate-value').textContent = `${Number(s.rate).toFixed(1)}×`;
  $('mode').value = s.mode;
  $('show-mine').checked = s.showMine;
  $('voice-note').hidden = !remote.has(select.value);

  $('voice').onchange = (e) => {
    chrome.storage.local.set({ voice: e.target.checked });
    if (!e.target.checked) { chrome.runtime.sendMessage({ type: 'stop-voice' }); }
  };
  select.onchange = (e) => {
    chrome.storage.local.set({ voiceName: e.target.value });
    $('voice-note').hidden = !remote.has(e.target.value);
  };
  $('rate').oninput = (e) => {
    $('rate-value').textContent = `${Number(e.target.value).toFixed(1)}×`;
    chrome.storage.local.set({ rate: Number(e.target.value) });
  };
  $('mode').onchange = (e) => chrome.storage.local.set({ mode: e.target.value });
  $('show-mine').onchange = (e) => chrome.storage.local.set({ showMine: e.target.checked });
  $('test-voice').onclick = () => chrome.runtime.sendMessage({ type: 'test-voice' });
}

async function render() {
  await Promise.all([renderSite(), renderSites()]);
}

render();
renderVoice();
