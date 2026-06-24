/**
 * Map pathfinder dump firm summaries to Affinity company names at seed time.
 */
import { firmKey, resolveFirmLookupKey } from './firm-key.util';

export interface FirmProximity {
  firmId: string;
  label: string;
  code: string;
  hasPath: boolean;
}

const norm = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function buildFirmByLabelIndex(
  summaries: Array<{ investor_id: string; firm_label: string; best_proximity_code: string; has_path: boolean }>
): Map<string, FirmProximity> {
  const firmByLabel = new Map<string, FirmProximity>();
  for (const s of summaries) {
    const fp: FirmProximity = {
      firmId: s.investor_id,
      label: s.firm_label,
      code: s.best_proximity_code,
      hasPath: s.has_path,
    };
    const normKey = norm(s.firm_label);
    const fk = firmKey(s.firm_label);
    if (normKey) firmByLabel.set(normKey, fp);
    if (fk) firmByLabel.set(fk, fp);
  }
  return firmByLabel;
}

export function lookupFirmProximity(
  firmName: string,
  firmByLabel: Map<string, FirmProximity>
): FirmProximity | undefined {
  const keys = [resolveFirmLookupKey(firmName), firmKey(firmName), norm(firmName)].filter(Boolean);
  for (const key of keys) {
    const hit = firmByLabel.get(key);
    if (hit) return hit;
  }
  return undefined;
}
