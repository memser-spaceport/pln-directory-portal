import { AffinityEntityLinkMethod } from '@prisma/client';

/** Confidence for name-only matches (last resort; higher methods win). */
export const NAME_MATCH_CONFIDENCE = 0.5;

export interface TeamMatchIndex {
  byAirtableRecId: Map<string, string>;
  byDomain: Map<string, string>;
  byExistingAffinityOrgId: Map<string, string>;
  byName: Map<string, string>;
}

export interface MemberMatchIndex {
  byAirtableRecId: Map<string, string>;
  byUid: Map<string, string>;
  byEmail: Map<string, string>;
  byExistingAffinityPersonId: Map<string, string>;
  byName: Map<string, string>;
}

export interface CompanySidecarIndex {
  byAffinityOrgId: Map<string, string>;
}

export interface TeamMatchInput {
  name?: string | null;
  buildersFunnelRecordId?: string | null;
  domain?: string | null;
  domains?: string[];
  affinityOrgId: string;
}

export interface MemberMatchInput {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  buildersFunnelRecordId?: string | null;
  primaryEmail?: string | null;
  emailAddresses?: string[];
  affinityPersonId: string;
}

export interface MatchResult {
  uid: string;
  method: AffinityEntityLinkMethod;
  confidence: number;
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function normalizeDomain(urlOrDomain: string | null | undefined): string | null {
  if (!urlOrDomain?.trim()) return null;
  let s = urlOrDomain.trim().toLowerCase();
  if (s.includes('://')) {
    try {
      s = new URL(s).hostname;
    } catch {
      return null;
    }
  }
  s = s.replace(/^www\./, '').replace(/\/$/, '');
  return s || null;
}

export function normalizeMatchName(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Company names: also strip common legal suffixes before compare. */
export function normalizeCompanyMatchName(name: string | null | undefined): string | null {
  const base = normalizeMatchName(name);
  if (!base) return null;
  const stripped = base
    .replace(/[,.]/g, '')
    .replace(/\s+(inc|llc|ltd|corp|co|limited|corporation)\.?$/i, '')
    .trim();
  return stripped || base;
}

function personNameCandidates(input: MemberMatchInput): string[] {
  const out: string[] = [];
  const full = normalizeMatchName(input.fullName);
  if (full) out.push(full);
  const composed = normalizeMatchName(`${input.firstName?.trim() ?? ''} ${input.lastName?.trim() ?? ''}`.trim());
  if (composed && !out.includes(composed)) out.push(composed);
  return out;
}

export function buildTeamMatchIndex(
  rows: {
    uid: string;
    name: string;
    airtableRecId: string | null;
    website: string | null;
  }[]
): TeamMatchIndex {
  const byAirtableRecId = new Map<string, string>();
  const byDomain = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const row of rows) {
    if (row.airtableRecId) byAirtableRecId.set(row.airtableRecId, row.uid);
    const d = normalizeDomain(row.website);
    if (d && !byDomain.has(d)) byDomain.set(d, row.uid);
    const n = normalizeCompanyMatchName(row.name);
    if (n && !byName.has(n)) byName.set(n, row.uid);
  }
  return { byAirtableRecId, byDomain, byExistingAffinityOrgId: new Map(), byName };
}

export function buildMemberMatchIndex(
  rows: {
    uid: string;
    name: string;
    email: string | null;
    airtableRecId: string | null;
  }[]
): MemberMatchIndex {
  const byAirtableRecId = new Map<string, string>();
  const byUid = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const nameCounts = new Map<string, number>();
  for (const row of rows) {
    const n = normalizeMatchName(row.name);
    if (n) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  }

  const byName = new Map<string, string>();
  for (const row of rows) {
    if (row.airtableRecId) byAirtableRecId.set(row.airtableRecId, row.uid);
    byUid.set(row.uid, row.uid);
    const e = normalizeEmail(row.email);
    if (e && !byEmail.has(e)) byEmail.set(e, row.uid);
    const n = normalizeMatchName(row.name);
    if (n && nameCounts.get(n) === 1) byName.set(n, row.uid);
  }
  return {
    byAirtableRecId,
    byUid,
    byEmail,
    byExistingAffinityPersonId: new Map(),
    byName,
  };
}

export function matchTeam(input: TeamMatchInput, index: TeamMatchIndex): MatchResult | null {
  const bf = input.buildersFunnelRecordId?.trim();
  if (bf?.startsWith('rec')) {
    const uid = index.byAirtableRecId.get(bf);
    if (uid) return { uid, method: 'AIRTABLE_REC_ID', confidence: 1 };
  }

  const domains = [normalizeDomain(input.domain), ...(input.domains ?? []).map((d) => normalizeDomain(d))].filter(
    (d): d is string => Boolean(d)
  );

  for (const d of domains) {
    const uid = index.byDomain.get(d);
    if (uid) return { uid, method: 'DOMAIN', confidence: 1 };
  }

  const existing = index.byExistingAffinityOrgId.get(input.affinityOrgId);
  if (existing) return { uid: existing, method: 'AFFINITY_ID', confidence: 0.9 };

  const companyName = normalizeCompanyMatchName(input.name);
  if (companyName) {
    const uid = index.byName.get(companyName);
    if (uid) return { uid, method: 'NAME', confidence: NAME_MATCH_CONFIDENCE };
  }

  return null;
}

export function matchMember(input: MemberMatchInput, index: MemberMatchIndex): MatchResult | null {
  const bf = input.buildersFunnelRecordId?.trim();
  if (bf?.startsWith('rec')) {
    const uid = index.byAirtableRecId.get(bf);
    if (uid) return { uid, method: 'AIRTABLE_REC_ID', confidence: 1 };
  }
  if (bf?.startsWith('cl')) {
    const uid = index.byUid.get(bf);
    if (uid) return { uid, method: 'DIRECTORY_UID', confidence: 1 };
  }

  const emails = [normalizeEmail(input.primaryEmail), ...(input.emailAddresses ?? []).map(normalizeEmail)].filter(
    Boolean
  );

  for (const e of emails) {
    const uid = index.byEmail.get(e);
    if (uid) return { uid, method: 'EMAIL', confidence: 1 };
  }

  const existing = index.byExistingAffinityPersonId.get(input.affinityPersonId);
  if (existing) return { uid: existing, method: 'AFFINITY_ID', confidence: 0.9 };

  for (const candidate of personNameCandidates(input)) {
    const uid = index.byName.get(candidate);
    if (uid) return { uid, method: 'NAME', confidence: NAME_MATCH_CONFIDENCE };
  }

  return null;
}

export function matchCompanySidecar(
  affinityOrgId: string | null | undefined,
  index: CompanySidecarIndex
): string | null {
  if (!affinityOrgId?.trim()) return null;
  return index.byAffinityOrgId.get(affinityOrgId.trim()) ?? null;
}
