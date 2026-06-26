/**
 * Resolve PATHFINDER_SCRATCH_DIR for portal seed scripts (mirrors
 * pln-data-enrichment/.../pathfinder-scratch.util.ts).
 */
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

export function defaultPathfinderScratchDir(): string {
  return join(__dirname, '../../../../..', 'seed_data', 'path_finder');
}

function readEnvFile(envPath: string, key: string): string {
  if (!existsSync(envPath)) return '';
  try {
    const env = readFileSync(envPath, 'utf-8');
    const line = env.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (!line) return '';
    const raw = line.slice(key.length + 1).trim();
    return raw.replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
}

export function resolvePathfinderScratchDir(options?: { mkdir?: boolean }): string {
  const mkdir = options?.mkdir !== false;
  const portalEnv = join(__dirname, '../../../..', '.env');
  const enrichmentEnv = join(__dirname, '../../../../../pln-data-enrichment/apps/data-enrichment/.env');

  let dir = process.env.PATHFINDER_SCRATCH_DIR?.trim();
  if (!dir) dir = readEnvFile(portalEnv, 'PATHFINDER_SCRATCH_DIR');
  if (!dir) dir = readEnvFile(enrichmentEnv, 'PATHFINDER_SCRATCH_DIR');
  if (!dir) dir = defaultPathfinderScratchDir();

  if (mkdir) mkdirSync(dir, { recursive: true });
  process.env.PATHFINDER_SCRATCH_DIR = dir;
  return dir;
}
