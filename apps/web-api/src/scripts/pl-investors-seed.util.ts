import { existsSync, readFileSync } from 'fs';
import { buildPlInvestorsIndex, type PlInvestorsListExport } from './pl-investors-index.util';
import { buildPriorBackingMap } from './pl-investors-match.util';
import type { PlInvestorsIndex, PriorBackingFlags } from './prior-backing.types';
import type { RosterListEntity } from './pl-investors-match.util';

const DEFAULT_PL_INVESTORS_FILE = '_affinity_166215.json';

export function loadPlInvestorsIndex(
  scratchDir: string,
  fileName = DEFAULT_PL_INVESTORS_FILE
): PlInvestorsIndex | null {
  const path = `${scratchDir}/${fileName}`;
  if (!existsSync(path)) {
    console.warn(`PL investors list not found at ${path} — prior-backer boost skipped`);
    return null;
  }
  const doc = JSON.parse(readFileSync(path, 'utf-8')) as PlInvestorsListExport;
  return buildPlInvestorsIndex(doc);
}

export function loadPriorBackingMap(
  scratchDir: string,
  rosterEntries: Array<{ entity?: RosterListEntity | null }>,
  fileName = DEFAULT_PL_INVESTORS_FILE
): Map<string, PriorBackingFlags> {
  const index = loadPlInvestorsIndex(scratchDir, fileName);
  if (!index) return new Map();
  return buildPriorBackingMap(rosterEntries, index);
}
