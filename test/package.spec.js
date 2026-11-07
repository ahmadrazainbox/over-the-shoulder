import { execFileSync } from 'node:child_process';
import { access, readFile, rename, rm } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

// The release zip (scripts/package.sh) holds exactly the extension's tracked files, ready for "Load
// unpacked": nothing from the tests, no dotfiles, and the version the manifest carries.
test('the release zip holds exactly the extension folder', async () => {
  const { version } = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
  // A zip already built for a release is moved aside and put back untouched; the one this test builds is removed.
  const built = `over-the-shoulder-${version}.zip`;
  const aside = `${built}.kept-by-test`;
  const existed = await access(built).then(() => true, () => false);
  if (existed) { await rename(built, aside); }
  const zip = execFileSync('sh', ['scripts/package.sh'], { encoding: 'utf8' }).trim();
  try {
    expect(zip).toBe(`over-the-shoulder-${version}.zip`);
    const inZip = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter((f) => f && !f.endsWith('/'));
    const tracked = execFileSync('git', ['ls-files', 'extension'], { encoding: 'utf8' })
      .split('\n').filter(Boolean).map((f) => f.replace(/^extension\//, ''));
    expect(inZip.sort()).toEqual(tracked.sort());
    const manifest = JSON.parse(execFileSync('unzip', ['-p', zip, 'manifest.json'], { encoding: 'utf8' }));
    expect(manifest.version).toBe(version);
  } finally {
    await rm(built, { force: true });
    if (existed) { await rename(aside, built); }
  }
});
