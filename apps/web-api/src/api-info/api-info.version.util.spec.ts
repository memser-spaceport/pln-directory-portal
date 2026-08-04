import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { UNKNOWN_VERSION } from './api-info.constants';
import { packageJsonCandidates, resolveServiceVersion } from './api-info.version.util';

describe('resolveServiceVersion', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'api-info-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('should read the version from the first package.json that declares one', () => {
    const packageJson = join(dir, 'package.json');
    writeFileSync(packageJson, JSON.stringify({ name: 'test', version: '1.2.3' }));

    expect(resolveServiceVersion([join(dir, 'missing', 'package.json'), packageJson])).toBe('1.2.3');
  });

  it('should fall back to unknown when no candidate exists', () => {
    expect(resolveServiceVersion([join(dir, 'nope', 'package.json')])).toBe(UNKNOWN_VERSION);
  });

  it('should fall back to unknown when the file is not valid JSON', () => {
    const packageJson = join(dir, 'package.json');
    writeFileSync(packageJson, 'not json');

    expect(resolveServiceVersion([packageJson])).toBe(UNKNOWN_VERSION);
  });

  it('should skip a package.json without a usable version', () => {
    const noVersion = join(dir, 'package.json');
    writeFileSync(noVersion, JSON.stringify({ name: 'no-version' }));

    expect(resolveServiceVersion([noVersion])).toBe(UNKNOWN_VERSION);
  });

  it('should resolve the workspace version by default', () => {
    expect(resolveServiceVersion()).not.toBe(UNKNOWN_VERSION);
  });
});

describe('packageJsonCandidates', () => {
  it('should walk up to the filesystem root, nearest first, without duplicates', () => {
    const candidates = packageJsonCandidates([join('/a', 'b', 'c')]);

    expect(candidates[0]).toBe(join('/a', 'b', 'c', 'package.json'));
    expect(candidates).toContain(join('/a', 'package.json'));
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('should de-duplicate overlapping start directories', () => {
    const candidates = packageJsonCandidates([join('/a', 'b'), join('/a', 'b')]);

    expect(new Set(candidates).size).toBe(candidates.length);
  });
});
