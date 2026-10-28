import { test, expect, overlay, send } from './fixtures.js';

// A site the user enabled. The extension copy used here already holds permission for it, which is the
// state Chrome is in after the user accepts "Enable on this site".
const HOST = 'enabled-site.example';
const PATTERN = `http://${HOST}/*`;
test.use({ grantedHost: HOST });

const registered = (worker) => worker.evaluate(async () =>
  (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
const siteUrl = (server) => server.replace('127.0.0.1', HOST) + '/page.html';

// The overlay is running in a page if a step event with nothing lit shows the corner toast.
async function overlayRuns(page) {
  await send(page, { step: 9, label: 'check' });
  return Boolean((await overlay(page)).toast);
}

test('an enabled site is registered on install and gets the overlay', async ({ worker, page, server }) => {
  await expect.poll(() => registered(worker)).toContain(`site:${PATTERN}`);
  await page.goto(siteUrl(server));
  await expect.poll(() => overlayRuns(page)).toBe(true);
});

test('the tab open while enabling gets the overlay without a reload', async ({ worker, page, server }) => {
  await expect.poll(() => registered(worker)).toContain(`site:${PATTERN}`);
  await worker.evaluate((origins) => globalThis.overTheShoulder.removed({ origins }), [PATTERN]);
  await page.goto(siteUrl(server));
  expect(await overlayRuns(page)).toBe(false);

  await worker.evaluate(async ({ origins, url }) => {
    const [tab] = await chrome.tabs.query({ url });
    await chrome.storage.session.set({ pending: { tabId: tab.id, pattern: origins[0], at: Date.now() } });
    await globalThis.overTheShoulder.added({ origins });
  }, { origins: [PATTERN], url: PATTERN });
  await expect.poll(() => overlayRuns(page)).toBe(true);
  expect(await worker.evaluate(() => chrome.storage.session.get('pending'))).toEqual({});
});

test('a pending tab older than two minutes is not injected', async ({ worker, page, server }) => {
  await expect.poll(() => registered(worker)).toContain(`site:${PATTERN}`);
  await worker.evaluate((origins) => globalThis.overTheShoulder.removed({ origins }), [PATTERN]);
  await page.goto(siteUrl(server));
  await worker.evaluate(async ({ origins, url }) => {
    const [tab] = await chrome.tabs.query({ url });
    await chrome.storage.session.set({ pending: { tabId: tab.id, pattern: origins[0], at: Date.now() - 180000 } });
    await globalThis.overTheShoulder.added({ origins });
  }, { origins: [PATTERN], url: PATTERN });
  await page.waitForTimeout(300);
  expect(await overlayRuns(page)).toBe(false);
  expect(await worker.evaluate(() => chrome.storage.session.get('pending'))).toEqual({});
});

test('removing a site unregisters it', async ({ worker, page, server }) => {
  await expect.poll(() => registered(worker)).toContain(`site:${PATTERN}`);
  await worker.evaluate((origins) => globalThis.overTheShoulder.removed({ origins }), [PATTERN]);
  expect(await registered(worker)).not.toContain(`site:${PATTERN}`);
  await page.goto(siteUrl(server));
  await page.waitForTimeout(500);
  expect(await overlayRuns(page)).toBe(false);
});

test('built-in local hosts are never registered as extra sites', async ({ worker }) => {
  await expect.poll(() => registered(worker)).toContain(`site:${PATTERN}`);
  expect((await registered(worker)).filter((id) => /localhost|127\.0\.0\.1|\.test\//.test(id))).toEqual([]);
});
