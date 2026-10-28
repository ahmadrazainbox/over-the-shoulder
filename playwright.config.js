import { defineConfig } from '@playwright/test';

// The extension is loaded into Playwright's bundled Chromium (branded Chrome ignores --load-extension), so
// the tests run one at a time, each in a fresh profile.
export default defineConfig({
  testDir: 'test',
  workers: 1,
  timeout: 30000,
  reporter: 'list',
});
