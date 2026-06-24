/**
 * Match Neuro/Gold roster people to Affinity list 166215 prior-backer index.
 * Pure: no I/O.
 */
import { firmKey } from './firm-key.util';
import type { PlInvestorFirmEntry, PlInvestorsIndex, PriorBackingFlags } from './prior-backing.types';

const FILECOIN_INTERACTION_RE = /\bfilecoin\b|filecoin foundation|\bfil\.vc\b/i;

export interface RosterListField {
  id?: string;
  name?: string;
  value?: { type?: string; data?: unknown } | null;
}

export interface RosterListEntity {
  id?: number | string;
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddress?: string | null;
  emailAddresses?: string[] | null;
  fields?: RosterListField[] | null;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function rosterEmails(entity: RosterListEntity): string[] {
  const out: string[] = [];
  const primary = normalizeEmail(entity.primaryEmailAddress);
  if (primary) out.push(primary);
  for (const e of entity.emailAddresses ?? []) {
    const n = normalizeEmail(e);
    if (n) out.push(n);
  }
  return [...new Set(out)];
}

function rosterFirmNames(entity: RosterListEntity): string[] {
  const comp = (entity.fields ?? []).find((f) => f.id === 'companies' || f.name === 'Companies');
  const data = comp?.value?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((d) => (d && typeof d === 'object' ? (d as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    .map((n) => n.trim());
}

function interactionText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as { subject?: unknown; title?: unknown };
  const subject = typeof d.subject === 'string' ? d.subject : '';
  const title = typeof d.title === 'string' ? d.title : '';
  return `${subject} ${title}`.trim();
}

/** Affinity RI fields on person exports that may mention Filecoin. */
export function detectFilecoinInteractionHeuristic(fields: RosterListField[] | null | undefined): boolean {
  const ids = new Set(['first-email', 'last-email', 'last-event', 'last-contact', 'first-event']);
  for (const f of fields ?? []) {
    if (!f.id || !ids.has(f.id)) continue;
    if (FILECOIN_INTERACTION_RE.test(interactionText(f.value?.data))) return true;
  }
  return false;
}

function lookupByFirm(index: PlInvestorsIndex, firmNames: string[]): PlInvestorFirmEntry | undefined {
  for (const name of firmNames) {
    const fk = firmKey(name);
    if (fk) {
      const hit = index.byFirmKey.get(fk);
      if (hit) return hit;
    }
  }
  return undefined;
}

function toFlags(
  entry: PlInvestorFirmEntry,
  matchKind: PriorBackingFlags['matchKind'],
  filecoinFromInteractions: boolean,
): PriorBackingFlags {
  return {
    backedProtocolLabs: entry.backedProtocolLabs,
    backedFilecoin: entry.backedFilecoin || filecoinFromInteractions,
    matchKind,
    source: 'affinity-list-166215',
    firmName: entry.firmName,
    affinityOrgId: entry.affinityOrgId,
  };
}

/** Resolve prior-backer flags for one roster person, or undefined when no match. */
export function resolvePriorBacking(
  entity: RosterListEntity,
  index: PlInvestorsIndex,
): PriorBackingFlags | undefined {
  const affinityId = typeof entity.id === 'number' ? entity.id : parseInt(String(entity.id ?? ''), 10);
  const filecoinHeuristic = detectFilecoinInteractionHeuristic(entity.fields);

  let firmEntry: PlInvestorFirmEntry | undefined;
  let personMatch = false;

  if (Number.isFinite(affinityId)) {
    firmEntry = index.byAffinityPersonId.get(affinityId);
    if (firmEntry) personMatch = true;
  }

  if (!firmEntry) {
    for (const email of rosterEmails(entity)) {
      const hit = index.byEmail.get(email);
      if (hit) {
        firmEntry = hit;
        personMatch = true;
        break;
      }
    }
  }

  const firmNames = rosterFirmNames(entity);
  const firmOnlyEntry = lookupByFirm(index, firmNames);
  if (!firmEntry && firmOnlyEntry) {
    firmEntry = firmOnlyEntry;
  } else if (firmEntry && firmOnlyEntry && firmEntry.affinityOrgId !== firmOnlyEntry.affinityOrgId) {
    // person/email pointed at one firm; companies field at another — treat as both
    personMatch = true;
  }

  if (!firmEntry) {
    if (!filecoinHeuristic) return undefined;
    return {
      backedProtocolLabs: false,
      backedFilecoin: true,
      matchKind: 'person',
      source: 'affinity-list-166215',
    };
  }

  const firmMatched = firmOnlyEntry != null && firmNames.length > 0;
  let matchKind: PriorBackingFlags['matchKind'] = 'firm';
  if (personMatch && firmMatched) matchKind = 'both';
  else if (personMatch) matchKind = 'person';

  return toFlags(firmEntry, matchKind, filecoinHeuristic);
}

/** Map affinity person id -> prior backing for a roster export. */
export function buildPriorBackingMap(
  entries: Array<{ entity?: RosterListEntity | null }>,
  index: PlInvestorsIndex,
): Map<string, PriorBackingFlags> {
  const map = new Map<string, PriorBackingFlags>();
  for (const row of entries) {
    const entity = row.entity;
    if (!entity?.id) continue;
    const flags = resolvePriorBacking(entity, index);
    if (flags) map.set(String(entity.id), flags);
  }
  return map;
}
