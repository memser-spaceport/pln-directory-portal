import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { UNKNOWN_VERSION } from './api-info.constants';

/**
 * Candidate `package.json` locations, nearest first, walking up from each start
 * directory. This avoids hardcoding a relative path, which would differ between
 * environments (`apps/web-api/src/api-info` under ts-jest vs. `dist/apps/web-api`
 * for the webpack bundle).
 *
 * `process.cwd()` is searched before `__dirname` on purpose: both the Procfile
 * (`node dist/apps/web-api/main.js`) and the Dockerfile (`WORKDIR /app`) run from
 * the workspace root, so the cwd holds the real workspace `package.json`, whereas
 * a build can emit its own generated `package.json` next to the bundle.
 */
export function packageJsonCandidates(startDirs: string[] = [process.cwd(), __dirname]): string[] {
  const candidates: string[] = [];
  for (const start of startDirs) {
    let dir = start;
    let parent = dirname(dir);
    // `dirname` is a fixed point at the filesystem root, which ends the walk.
    while (true) {
      const candidate = join(dir, 'package.json');
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
      if (parent === dir) {
        break;
      }
      dir = parent;
      parent = dirname(dir);
    }
  }
  return candidates;
}

/**
 * Reads `version` from the first readable `package.json` that declares one.
 * Never throws: an unreadable or malformed file falls back to `unknown`.
 */
export function resolveServiceVersion(candidates: string[] = packageJsonCandidates()): string {
  for (const candidate of candidates) {
    try {
      const { version } = JSON.parse(readFileSync(candidate, 'utf8'));
      if (typeof version === 'string' && version.length > 0) {
        return version;
      }
    } catch {
      // Missing, unreadable or invalid JSON — try the next candidate.
    }
  }
  return UNKNOWN_VERSION;
}
