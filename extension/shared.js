// Shared by the service worker and the popup.

export const DEFAULTS = { voice: false, voiceName: '', rate: 1, mode: 'interrupt', showMine: false };

// Covered by the manifest's own content script, so never asked for or registered.
export const BUILT_IN = /^https?:\/\/(localhost|127\.0\.0\.1|[^/]*\.test)\/\*$/;

// One permission per host. A match pattern without a port matches every port on that host.
export function patternFor(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') { return null; }
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

export const isUserPattern = (p) => /^https?:\/\//.test(p) && !BUILT_IN.test(p);
