import { test as base, chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, cp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { expect } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const extension = path.resolve(here, '../extension');

export const test = base.extend({
  // A host name (resolved to 127.0.0.1) that a test copy of the extension already holds permission for,
  // standing in for a site the user enabled; tests cannot click Chrome's permission dialog.
  grantedHost: [null, { option: true }],

  // Serves test/ on 127.0.0.1, one of the hosts the overlay always runs on. Any path without a file
  // (such as /next after pushState) gets the test page.
  // eslint-disable-next-line no-empty-pattern
  server: [async ({}, use) => {
    const server = createServer(async (req, res) => {
      const name = path.basename(new URL(req.url, 'http://x').pathname) || 'page.html';
      const file = ['page.html', 'frame.html', 'stale.html'].includes(name) ? name : 'page.html';
      res.setHeader('content-type', 'text/html');
      res.end(await readFile(path.join(here, file)));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await use(`http://127.0.0.1:${server.address().port}`);
    server.close();
  }, { scope: 'worker' }],

  extensionDir: async ({ grantedHost }, use) => {
    if (!grantedHost) { await use(extension); return; }
    const copy = await mkdtemp(path.join(tmpdir(), 'ots-ext-'));
    await cp(extension, copy, { recursive: true });
    const manifest = JSON.parse(await readFile(path.join(copy, 'manifest.json'), 'utf8'));
    manifest.host_permissions = [`http://${grantedHost}/*`];
    await writeFile(path.join(copy, 'manifest.json'), JSON.stringify(manifest));
    await use(copy);
    await rm(copy, { recursive: true, force: true });
  },

  context: async ({ extensionDir, grantedHost }, use) => {
    const profile = await mkdtemp(path.join(tmpdir(), 'ots-'));
    const args = [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`];
    if (grantedHost) { args.push(`--host-resolver-rules=MAP ${grantedHost} 127.0.0.1`); }
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1000, height: 900 },
      args,
    });
    await use(context);
    await context.close();
    await rm(profile, { recursive: true, force: true });
  },

  // The service worker, once it is fully started: caught in its first moments, it can answer before its
  // globals and extension APIs exist, so it is asked again until they do.
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    for (let tries = 0; ; tries++) {
      const ready = await worker.evaluate(() => typeof setTimeout === 'function'
        && Boolean(globalThis.chrome?.scripting && globalThis.chrome?.tts && globalThis.overTheShoulder)).catch(() => false);
      if (ready) { break; }
      if (tries > 100) { throw new Error('The extension service worker did not start'); }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await use(worker);
  },

  page: async ({ context, server }, use) => {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(`${server}/page.html`);
    // Still moves in the first second after a load are ignored by design.
    await page.waitForTimeout(1100);
    await use(page);
  },
});

// The overlay's state, read from its open shadow root in the given frame.
export const overlay = (frame) => frame.evaluate(() => {
  const root = document.querySelector('[data-over-the-shoulder]')?.shadowRoot;
  const box = (el) => {
    if (!el || el.style.display !== 'block') { return null; }
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, text: el.textContent };
  };
  return {
    spot: box(root?.querySelector('.spot')),
    badge: box(root?.querySelector('.badge')),
    label: box(root?.querySelector('.label')),
    toast: box(root?.querySelector('.toast')),
    ripples: root ? root.querySelectorAll('.ripple').length : 0,
  };
});

export const send = (page, detail) => page.evaluate((d) => {
  window.dispatchEvent(new CustomEvent('over-the-shoulder', { detail: JSON.stringify(d) }));
}, detail);
