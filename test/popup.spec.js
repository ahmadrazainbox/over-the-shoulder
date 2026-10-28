import { test, expect } from './fixtures.js';

// Opens the real popup page as a tab. Two things a test cannot do for real are stood in for before the
// popup's own script runs: which tab the popup was opened on, and Chrome's permission dialog (whose answer
// is `grant`). The pending-tab write is recorded and never resolves, so if the popup awaited it before
// asking for permission, the request would never be made and the test would fail: Chrome only accepts a
// permission request made straight from the click.
async function openPopup(context, worker, tab, { grant = true } = {}) {
  const id = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.addInitScript(({ tab, grant }) => {
    globalThis.calls = [];
    chrome.tabs.query = async () => [tab];
    chrome.permissions.request = async (p) => { globalThis.calls.push(['request', p]); return grant; };
    chrome.storage.session.set = (value) => { globalThis.calls.push(['pending', value]); return new Promise(() => {}); };
    chrome.storage.session.remove = async (key) => { globalThis.calls.push(['cleared', key]); };
  }, { tab, grant });
  await popup.goto(`chrome-extension://${id}/popup.html`);
  return popup;
}

const calls = (popup) => popup.evaluate(() => globalThis.calls);

test('a local site is always on, with nothing to enable', async ({ context, worker }) => {
  const popup = await openPopup(context, worker, { id: 7, url: 'http://shop.test/orders' });
  await expect(popup.locator('#site-name')).toHaveText('shop.test');
  await expect(popup.locator('#site-status')).toHaveText('Always on for local sites.');
  await expect(popup.locator('#site-action')).toBeHidden();
});

test('a browser page is not offered', async ({ context, worker }) => {
  const popup = await openPopup(context, worker, { id: 7, url: 'chrome://newtab/' });
  await expect(popup.locator('#site-name')).toHaveText('Not a web page');
  await expect(popup.locator('#site-action')).toBeHidden();
});

test('a tab whose address Chrome withholds is reported, not misread', async ({ context, worker }) => {
  const popup = await openPopup(context, worker, { id: 7 });
  await expect(popup.locator('#site-name')).toHaveText('Not a web page');
});

test('enabling a site asks for that one host, straight from the click', async ({ context, worker }) => {
  const popup = await openPopup(context, worker, { id: 42, url: 'https://example.com:8443/app?x=1' });
  await expect(popup.locator('#site-name')).toHaveText('example.com');
  await expect(popup.locator('#site-status')).toHaveText(/^Off\./);
  await popup.locator('#site-action', { hasText: 'Enable on this site' }).click();
  await expect.poll(() => calls(popup)).toContainEqual(['request', { origins: ['https://example.com/*'] }]);
  const pending = (await calls(popup)).find(([kind]) => kind === 'pending')?.[1].pending;
  expect(pending).toMatchObject({ tabId: 42, pattern: 'https://example.com/*' });
  expect(Date.now() - pending.at).toBeLessThan(10000);
});

test('a refused permission clears the pending tab', async ({ context, worker }) => {
  const popup = await openPopup(context, worker, { id: 42, url: 'https://example.com/' }, { grant: false });
  await popup.locator('#site-action').click();
  await expect.poll(() => calls(popup)).toContainEqual(['cleared', 'pending']);
});

test('voice settings are saved', async ({ context, worker }) => {
  const popup = await openPopup(context, worker, { id: 7, url: 'http://shop.test/' });
  await popup.locator('#voice').check();
  await popup.locator('#mode').selectOption('queue');
  await popup.locator('#rate').evaluate((el) => { el.value = '1.5'; el.dispatchEvent(new Event('input')); });
  await popup.locator('#show-mine').check();
  await expect(popup.locator('#rate-value')).toHaveText('1.5×');
  await expect.poll(() => worker.evaluate(() => chrome.storage.local.get(null)))
    .toMatchObject({ voice: true, mode: 'queue', rate: 1.5, showMine: true });
});
