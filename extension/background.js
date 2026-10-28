// Over the Shoulder service worker: keeps the overlay registered on the sites the user enabled, and speaks
// the agent's narration with chrome.tts when voice is on.
//
// Sites: the popup asks Chrome for permission on one origin. Registration happens here, on
// permissions.onAdded, because the popup may close while Chrome's permission dialog is open. Removing a
// site (from the popup, or from Chrome's own extension menu) unregisters it. On install and on each start,
// the registered scripts are checked against the permissions actually held.

import { DEFAULTS, isUserPattern } from './shared.js';

const PREFIX = 'site:';

const settings = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) });
const scriptFor = (pattern) => ({
  id: PREFIX + pattern,
  matches: [pattern],
  js: ['overlay.js'],
  allFrames: true,
  matchOriginAsFallback: true,
  runAt: 'document_idle',
  persistAcrossSessions: true,
});
const userPatterns = (origins = []) => origins.filter(isUserPattern);

// Registration changes run one at a time: install, start-up and a new permission can arrive together, and
// two overlapping register() calls would both try to add the same script id.
let queue = Promise.resolve();
const serial = (job) => (queue = queue.then(job, job));

async function register(patterns) {
  const existing = new Set((await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
  const fresh = patterns.filter((p) => !existing.has(PREFIX + p));
  if (fresh.length) { await chrome.scripting.registerContentScripts(fresh.map(scriptFor)); }
}

async function unregister(patterns) {
  const existing = new Set((await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
  const ids = patterns.map((p) => PREFIX + p).filter((id) => existing.has(id));
  if (ids.length) { await chrome.scripting.unregisterContentScripts({ ids }); }
}

async function reconcile() {
  const held = userPatterns((await chrome.permissions.getAll()).origins);
  const registered = (await chrome.scripting.getRegisteredContentScripts())
    .filter((s) => s.id.startsWith(PREFIX)).map((s) => s.id.slice(PREFIX.length));
  await unregister(registered.filter((p) => !held.includes(p)));
  await register(held);
}

// The tab the user was on when they pressed "Enable on this site" gets the overlay straight away, so they
// do not have to reload it.
async function injectPending(patterns) {
  const { pending } = await chrome.storage.session.get('pending');
  if (!pending) { return; }
  if (!(Date.now() - pending.at < 120000)) { await chrome.storage.session.remove('pending'); return; }
  if (!patterns.includes(pending.pattern)) { return; }
  await chrome.storage.session.remove('pending');
  try {
    await chrome.scripting.executeScript({ target: { tabId: pending.tabId, allFrames: true }, files: ['overlay.js'] });
  } catch { /* the tab was closed or navigated away */ }
}

chrome.runtime.onInstalled.addListener(() => serial(reconcile));
chrome.runtime.onStartup.addListener(() => serial(reconcile));

async function added({ origins }) {
  const patterns = userPatterns(origins);
  await serial(() => register(patterns));
  await injectPending(patterns);
}
const removed = ({ origins }) => serial(() => unregister(userPatterns(origins)));
chrome.permissions.onAdded.addListener(added);
chrome.permissions.onRemoved.addListener(removed);



// Speech. Any script on an enabled page can send the step event, not only the agent, so: only the top
// frame of the tab in front of its window may speak (the window itself need not be focused: the developer
// is often typing in a terminal beside it); text is capped; lines faster than one every 400 ms are
// dropped; and in queue mode at most two lines wait, so a page cannot build an endless queue. Alt+Shift+S
// (or switching voice off) stops speech. Nothing is stored.
let lastSpoke = 0;
let waiting = 0;
let mutedUntil = 0;
const stop = () => { chrome.tts.stop(); waiting = 0; mutedUntil = Date.now() + 10000; };
const DONE = new Set(['end', 'interrupted', 'cancelled', 'error']);
async function say(text, { force = false, tab = null } = {}) {
  const s = await settings();
  if (!force && (!s.voice || !tab?.active)) { return false; }
  const now = Date.now();
  if (!force && (now - lastSpoke < 400 || now < mutedUntil)) { return false; }
  const queue = s.mode === 'queue';
  if (!force && queue && waiting >= 2) { return false; }
  lastSpoke = now;
  if (!queue) { waiting = 0; }
  waiting++;
  const options = {
    rate: Math.min(2, Math.max(0.5, Number(s.rate) || 1)),
    enqueue: queue,
    onEvent: (event) => { if (DONE.has(event.type)) { waiting = Math.max(0, waiting - 1); } },
  };
  if (s.voiceName) { options.voiceName = s.voiceName; }
  chrome.tts.speak(String(text).slice(0, 300), options);
  return true;
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'stop-voice') { stop(); }
});

function message(message, sender, reply) {
  if (message?.type === 'say' && sender.tab && sender.frameId === 0) {
    say(message.text, { tab: sender.tab }).then(reply);
    return true;
  }
  if (message?.type === 'test-voice' && !sender.tab) {
    say('This is how each step will sound.', { force: true }).then(reply);
    return true;
  }
  if (message?.type === 'stop-voice' && !sender.tab) {
    stop();
  }
  return false;
}
chrome.runtime.onMessage.addListener(message);

// For the tests, which cannot click Chrome's permission dialog or send messages as a page frame. Only the
// service worker's own context can reach this; web pages and content scripts cannot.
globalThis.overTheShoulder = { added, removed, reconcile, message };
