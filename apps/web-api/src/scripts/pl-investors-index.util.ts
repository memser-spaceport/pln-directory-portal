/**
 * Index Affinity list 166215 ("Protocol Labs Investors") — company-grain prior backers.
 * Pure: no I/O.
 */
import { firmKey, normalizeFirmName } from './firm-key.util';
import type { PlInvestorFirmEntry, PlInvestorPersonRef, PlInvestorsIndex } from './prior-backing.types';

const BACKING_FIELD_NAMES = new Set([
  'Tags',
  'Customer',
  'Fund Relevance',
  'Relationship Role',
  'Firm Relationship',
  'Investor Type',
  'Sector Focus',
]);

const FILECOIN_RE = /\bfilecoin\b|filecoin foundation|\bfil\.vc\b/i;
const PROTOCOL_LABS_RE = /\bprotocol labs\b|\bprotocol\.ai\b/i;

export interface PlInvestorsListField {
  id?: string;
  name?: string;
  value?: { type?: string; data?: unknown } | null;
}

export interface PlInvestorsListEntity {
  id?: number;
  name?: string | null;
  domain?: string | null;
  domains?: string[] | null;
  fields?: PlInvestorsListField[] | null;
}

export interface PlInvestorsListEntry {
  entity?: PlInvestorsListEntity | null;
}

export interface PlInvestorsListExport {
  entries?: PlInvestorsListEntry[] | null;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function fieldTexts(field: PlInvestorsListField | undefined): string[] {
  const data = field?.value?.data;
  if (data == null) return [];
  if (typeof data === 'string' && data.trim()) return [data.trim()];
  if (Array.isArray(data)) {
    return data
      .map((d) => {
        if (typeof d === 'string') return d.trim();
        if (d && typeof d === 'object' && typeof (d as { text?: unknown }).text === 'string') {
          return (d as { text: string }).text.trim();
        }
        return '';
      })
      .filter(Boolean);
  }
  if (typeof data === 'object' && typeof (data as { text?: unknown }).text === 'string') {
    return [(data as { text: string }).text.trim()];
  }
  return [];
}

function scanBackingHints(fields: PlInvestorsListField[]): { filecoin: boolean; protocolLabs: boolean } {
  let filecoin = false;
  let protocolLabs = false;
  for (const f of fields) {
    if (!f.name || !BACKING_FIELD_NAMES.has(f.name)) continue;
    for (const text of fieldTexts(f)) {
      if (FILECOIN_RE.test(text)) filecoin = true;
      if (PROTOCOL_LABS_RE.test(text)) protocolLabs = true;
    }
  }
  return { filecoin, protocolLabs };
}

function parsePeople(fields: PlInvestorsListField[]): PlInvestorPersonRef[] {
  const personsField =
    fields.find((f) => f.id === 'persons' || f.name === 'People') ??
    fields.find((f) => f.name === 'People');
  const data = personsField?.value?.data;
  if (!Array.isArray(data)) return [];
  const out: PlInvestorPersonRef[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const p = row as {
      id?: number;
      firstName?: string;
      lastName?: string;
      primaryEmailAddress?: string | null;
    };
    if (typeof p.id !== 'number') continue;
    const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
    if (!name) continue;
    out.push({
      affinityPersonId: p.id,
      name,
      email: p.primaryEmailAddress ? normalizeEmail(p.primaryEmailAddress) : undefined,
    });
  }
  return out;
}

function parseFirmEntry(entity: PlInvestorsListEntity): PlInvestorFirmEntry | null {
  const firmName = (entity.name ?? '').trim();
  const affinityOrgId = entity.id;
  if (!firmName || typeof affinityOrgId !== 'number') return null;

  const fields = entity.fields ?? [];
  const hints = scanBackingHints(fields);
  const domains = [
    ...(entity.domain ? [entity.domain] : []),
    ...(Array.isArray(entity.domains) ? entity.domains : []),
  ]
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  return {
    firmName,
    affinityOrgId,
    domains: [...new Set(domains)],
    people: parsePeople(fields),
    backedProtocolLabs: true,
    backedFilecoin: hints.filecoin,
  };
}

function indexFirm(index: PlInvestorsIndex, entry: PlInvestorFirmEntry): void {
  const fk = firmKey(entry.firmName);
  const norm = normalizeFirmName(entry.firmName);
  if (fk && !index.byFirmKey.has(fk)) index.byFirmKey.set(fk, entry);
  if (norm && !index.byFirmKey.has(norm)) index.byFirmKey.set(norm, entry);
  for (const person of entry.people) {
    index.byAffinityPersonId.set(person.affinityPersonId, entry);
    if (person.email) index.byEmail.set(person.email, entry);
  }
}

/** Build lookup indexes from a full `_affinity_166215.json` export. */
export function buildPlInvestorsIndex(exportDoc: PlInvestorsListExport): PlInvestorsIndex {
  const index: PlInvestorsIndex = {
    byAffinityPersonId: new Map(),
    byEmail: new Map(),
    byFirmKey: new Map(),
  };
  for (const row of exportDoc.entries ?? []) {
    const entity = row.entity;
    if (!entity) continue;
    const entry = parseFirmEntry(entity);
    if (entry) indexFirm(index, entry);
  }
  return index;
}
