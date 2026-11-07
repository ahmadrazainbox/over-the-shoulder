import { defineConfig } from '@playwright/test';

// The extension is loaded into Playwright's bundled Chromium (branded Chrome ignores --load-extension), so
// the tests run one at a time, each in a fresh profile.
export default defineConfig({
  testDir: 'test',
  workers: 1,
  timeout: 30000,
  // The JSON report sits outside test-results/ (which each run clears), so a failure that does not come
  // back is still named afterwards (#35); a failing test also keeps its trace.
  reporter: [['list'], ['json', { outputFile: 'test-results-last/results.json' }]],
  use: { trace: 'retain-on-failure' },
});
