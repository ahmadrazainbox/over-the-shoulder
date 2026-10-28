import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// The version is written in several places; a release must change them all together.
const json = async (file) => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));

test('every file carries the same version, and the changelog starts with it', async () => {
  const pkg = await json('package.json');
  const lock = await json('package-lock.json');
  const versions = {
    'package.json': pkg.version,
    'package-lock.json': lock.version,
    'package-lock.json (root package)': lock.packages[''].version,
    'extension/manifest.json': (await json('extension/manifest.json')).version,
    'plugin/.claude-plugin/plugin.json': (await json('plugin/.claude-plugin/plugin.json')).version,
  };
  for (const [file, version] of Object.entries(versions)) {
    expect(version, file).toBe(pkg.version);
  }
  const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  // Changes waiting for the next release sit under "## Unreleased" above it.
  expect(changelog.match(/^## (?!Unreleased)(\S+)/m)?.[1], 'latest released CHANGELOG entry').toBe(pkg.version);
});
