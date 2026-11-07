import { defineConfig } from '@playwright/test';

// The extension is loaded into Playwright's bundled Chromium (branded Chrome ignores --load-extension), so
// the tests run one at a time, each in a fresh profile.
export default defineConfig({
  testDir: 'test',
  workers: 1,
  timeout: 30000,
  // Each run's JSON report is kept, one file per run, outside test-results/ (which each run clears), so a
  // failure that does not come back is still named afterwards (#35); a failing test also keeps its trace
  // in test-results/ until the next run. A `--reporter` on the command line replaces these: no JSON then.
  reporter: [['list'], ['json', { outputFile: `test-results-last/results-${new Date().toISOString().replace(/[:.]/g, '-')}.json` }]],
  use: { trace: 'retain-on-failure' },
});
