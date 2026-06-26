/**
 * Must match pln-data-enrichment/.../pathfinder/affinity-roster-mapper.util.ts
 *
 * Map an Affinity LP list export entry to investor profile fallbacks + affinityData.
 * Pure: no I/O — input is entity.fields[] from _affinity_352080.json.
 */
import type { RosterConnectorHints } from './pl-team-relationship.util';

export interface AffinityListField {
  id: string;
  name?: string;
  value?: { type?: string; data?: unknown } | null;
}

export interface AffinityListEntity {
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddress?: string | null;
  fields?: AffinityListField[] | null;
}

export interface AffinityPersonRef {
  name: string;
  email?: string;
  affinityPersonId?: number;
  memberUid?: string;
  affinityPersonType?: 'internal' | 'external';
}

export interface AffinityInteractionRef {
  date: string;
  method?: string;
  subject?: string;
  from?: AffinityPersonRef;
}

export interface AffinityData {
  lastContact?: AffinityInteractionRef;
  lastEmail?: AffinityInteractionRef;
  sourceOfIntroduction?: AffinityPersonRef;
  keyContact?: AffinityPersonRef;
  lpStage?: string;
}

export interface AffinityProfileFallbacks {
  linkedinUrl?: string;
  title?: string;
  geoFocus?: string;
  investorType?: string;
  sectorTags?: string;
  stageFocus?: string;
  checkSizeRange?: string;
  firmDomain?: string;
}

export interface MemberResolver {
  byEmail?: (email: string) => string | undefined;
  byName?: (name: string) => string | undefined;
}

export interface ExistingProfileColumns {
  linkedinUrl?: string | null;
  title?: string | null;
  geoFocus?: string | null;
  investorType?: string | null;
  sectorTags?: string | null;
  stageFocus?: string | null;
  checkSizeRange?: string | null;
  firmDomain?: string | null;
}

const FIELD_IDS = {
  linkedin: 'affinity-data-linkedin-url',
  jobTitle: 'affinity-data-current-job-title',
  location: 'affinity-data-location',
  industry: 'affinity-data-industry',
  sourceOfIntroduction: 'source-of-introduction',
  lastContact: 'last-contact',
  lastEmail: 'last-email',
  companies: 'companies',
} as const;

const FIELD_NAMES = {
  linkedin: 'LinkedIn URL',
  jobTitle: 'Current Job Title',
  locationCity: 'Location (City)',
  lpType: 'LP Type',
  investorType: 'Investor Type',
  sectorFocus: 'Sector Focus',
  stagePreference: 'Stage Preference',
  checkSize: 'Est. Check Size (USD)',
  keyContact: 'Key Contact (Relationship owner)',
  lpStage: 'LP Stage',
} as const;

function fieldByIdOrName(fields: AffinityListField[], id: string, name?: string): AffinityListField | undefined {
  const byId = fields.find((f) => f.id === id);
  if (byId) return byId;
  if (name) return fields.find((f) => f.name === name);
  return undefined;
}

function strData(field: AffinityListField | undefined): string | null {
  const data = field?.value?.data;
  return typeof data === 'string' && data.trim() ? data.trim() : null;
}

function dropdownText(field: AffinityListField | undefined): string | null {
  const data = field?.value?.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const text = (data as { text?: unknown }).text;
    if (typeof text === 'string' && text.trim()) return text.trim();
  }
  if (typeof data === 'string' && data.trim()) return data.trim();
  return null;
}

function dropdownMultiTexts(field: AffinityListField | undefined): string[] {
  const data = field?.value?.data;
  if (!Array.isArray(data)) return [];
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

function textMulti(field: AffinityListField | undefined): string[] {
  const data = field?.value?.data;
  if (!Array.isArray(data)) return [];
  return data.filter((d): d is string => typeof d === 'string' && d.trim().length > 0).map((d) => d.trim());
}

function formatLocation(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const loc = data as { city?: string | null; state?: string | null; country?: string | null };
  const parts = [loc.city, loc.state, loc.country].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

function personFromData(data: unknown, resolver?: MemberResolver): AffinityPersonRef | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const p = data as {
    id?: number;
    firstName?: string;
    lastName?: string;
    primaryEmailAddress?: string;
    type?: string;
  };
  const first = (p.firstName ?? '').trim();
  const last = (p.lastName ?? '').trim();
  const name = `${first} ${last}`.trim();
  if (!name) return null;
  const email = (p.primaryEmailAddress ?? '').trim() || undefined;
  const memberUid = email && resolver?.byEmail ? resolver.byEmail(email.toLowerCase()) : undefined;
  const personType = p.type === 'internal' || p.type === 'external' ? p.type : undefined;
  return {
    name,
    ...(email ? { email } : {}),
    ...(typeof p.id === 'number' ? { affinityPersonId: p.id } : {}),
    ...(memberUid ? { memberUid } : {}),
    ...(personType ? { affinityPersonType: personType } : {}),
  };
}

export function extractInteraction(
  field: AffinityListField | undefined,
  resolver?: MemberResolver
): AffinityInteractionRef | null {
  const data = field?.value?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as {
    type?: string;
    subject?: string;
    sentAt?: string;
    date?: string;
    from?: { emailAddress?: string; person?: unknown };
  };
  const date = d.sentAt ?? d.date;
  if (typeof date !== 'string' || !date.trim()) return null;
  const fromPerson = d.from?.person ? personFromData(d.from.person, resolver) : null;
  const fromEmail = (d.from?.emailAddress ?? '').trim();
  const from: AffinityPersonRef | undefined =
    fromPerson ??
    (fromEmail
      ? {
          name: fromEmail,
          email: fromEmail,
          ...(resolver?.byEmail?.(fromEmail.toLowerCase())
            ? { memberUid: resolver.byEmail(fromEmail.toLowerCase()) }
            : {}),
        }
      : undefined);
  return {
    date: date.trim(),
    ...(typeof d.type === 'string' && d.type.trim() ? { method: d.type.trim() } : {}),
    ...(typeof d.subject === 'string' && d.subject.trim() ? { subject: d.subject.trim() } : {}),
    ...(from ? { from } : {}),
  };
}

export function extractPersonRef(
  field: AffinityListField | undefined,
  resolver?: MemberResolver
): AffinityPersonRef | null {
  const data = field?.value?.data;
  if (!data) return null;
  if (typeof data === 'string' && data.trim()) {
    const name = data.trim();
    const memberUid = resolver?.byName?.(name);
    return { name, ...(memberUid ? { memberUid } : {}) };
  }
  return personFromData(data, resolver);
}

/** Hints for PL connector roster fallback (key contact + last touch from PL leads). */
export function extractRosterConnectorHints(entity: AffinityListEntity): RosterConnectorHints {
  const fields = entity.fields ?? [];
  const keyContactField = fields.find((f) => f.name === FIELD_NAMES.keyContact);
  const lastContactField = fieldByIdOrName(fields, FIELD_IDS.lastContact, 'Last Contact');
  const lastEmailField = fieldByIdOrName(fields, FIELD_IDS.lastEmail, 'Last Email');
  const keyContact = extractPersonRef(keyContactField);
  const lastContact = extractInteraction(lastContactField);
  const lastEmail = extractInteraction(lastEmailField);

  return {
    ...(keyContact?.name ? { keyContactName: keyContact.name } : {}),
    ...(lastContact?.from?.name
      ? {
          lastContactFromName: lastContact.from.name,
          lastContactFromInternal: lastContact.from.affinityPersonType === 'internal',
          lastContactDate: lastContact.date,
        }
      : {}),
    ...(lastEmail?.from?.name
      ? {
          lastEmailFromName: lastEmail.from.name,
          lastEmailFromInternal: lastEmail.from.affinityPersonType === 'internal',
          lastEmailDate: lastEmail.date,
        }
      : {}),
  };
}

export function mapInvestorType(lpType: string | null, investorType: string | null): string | undefined {
  const raw = (lpType ?? investorType ?? '').toLowerCase();
  if (!raw) return undefined;
  if (/family\s*office/.test(raw)) return 'family_office';
  if (/angel|hnwi|individual|high\s*net/.test(raw)) return 'angel';
  if (/syndicate/.test(raw)) return 'syndicate';
  if (/hybrid/.test(raw)) return 'hybrid';
  if (/fund|allocator|endowment|pension|vc|venture|institution/.test(raw)) return 'fund';
  return 'unknown';
}

export function mapCheckSizeUsd(n: number | null | undefined): string | undefined {
  if (n == null || !Number.isFinite(n) || n <= 0) return undefined;
  if (n < 100_000) return '<100K';
  if (n < 500_000) return '100-500K';
  if (n < 1_000_000) return '500K-1M';
  if (n < 5_000_000) return '1M-5M';
  return '5M+';
}

export function mapStagePreference(text: string | null | undefined): string | undefined {
  if (!text || !text.trim()) return undefined;
  const t = text.toLowerCase();
  if (/pre-?seed/.test(t)) return 'pre-seed';
  if (/\bseed\b/.test(t) && !/series/.test(t)) return 'seed';
  if (/series\s*a|series-a/.test(t)) return 'series-a';
  if (/series\s*b|series\s*c|series-b\+|growth|late/.test(t)) return 'series-b+';
  if (/all|multi|any/.test(t)) return 'all';
  return 'unknown';
}

function normalizeSectorTokens(tokens: string[]): string | undefined {
  const normalized = [
    ...new Set(
      tokens
        .map((t) =>
          t
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
        )
        .filter(Boolean)
    ),
  ];
  return normalized.length > 0 ? normalized.join(',') : undefined;
}

function firmDomainFromCompanies(field: AffinityListField | undefined): string | undefined {
  const data = field?.value?.data;
  if (!Array.isArray(data)) return undefined;
  for (const item of data) {
    if (item && typeof item === 'object') {
      const domain = (item as { domain?: unknown }).domain;
      if (typeof domain === 'string' && domain.trim()) return domain.trim().toLowerCase();
    }
  }
  return undefined;
}

export function hasAffinityData(data: AffinityData): boolean {
  return !!(data.lastContact || data.lastEmail || data.sourceOfIntroduction || data.keyContact || data.lpStage);
}

function pickColumn(existing: string | null | undefined, affinity?: string): string | null {
  if (existing != null && existing.trim() !== '') return existing;
  return affinity ?? null;
}

/** Affinity fills profile columns only when the existing record has no value. */
export function mergeProfileFields(
  existing: ExistingProfileColumns,
  affinity: AffinityProfileFallbacks
): {
  linkedinUrl: string | null;
  title: string | null;
  geoFocus: string | null;
  investorType: string;
  sectorTags: string | null;
  stageFocus: string;
  checkSizeRange: string | null;
  firmDomain: string | null;
} {
  const investorType =
    existing.investorType && existing.investorType !== 'unknown'
      ? existing.investorType
      : affinity.investorType ?? 'fund';
  const stageFocus =
    existing.stageFocus && existing.stageFocus.trim() !== '' ? existing.stageFocus : affinity.stageFocus ?? '';

  return {
    linkedinUrl: pickColumn(existing.linkedinUrl, affinity.linkedinUrl),
    title: pickColumn(existing.title, affinity.title),
    geoFocus: pickColumn(existing.geoFocus, affinity.geoFocus),
    investorType,
    sectorTags: pickColumn(existing.sectorTags, affinity.sectorTags),
    stageFocus,
    checkSizeRange: pickColumn(existing.checkSizeRange, affinity.checkSizeRange),
    firmDomain: pickColumn(existing.firmDomain, affinity.firmDomain),
  };
}

export function buildRawPayload(
  enrichment: Record<string, unknown> | undefined,
  affinityData: AffinityData,
  existingRaw?: unknown
): Record<string, unknown> | undefined {
  const base =
    existingRaw && typeof existingRaw === 'object' && !Array.isArray(existingRaw)
      ? { ...(existingRaw as Record<string, unknown>) }
      : {};
  if (enrichment) base.enrichment = enrichment;
  else if (!base.enrichment) delete base.enrichment;
  if (hasAffinityData(affinityData)) base.affinityData = affinityData;
  else delete base.affinityData;
  return Object.keys(base).length > 0 ? base : undefined;
}

export function mapAffinityListEntry(
  entity: AffinityListEntity,
  opts?: { memberResolver?: MemberResolver }
): { profile: AffinityProfileFallbacks; affinityData: AffinityData } {
  const fields = entity.fields ?? [];
  const resolver = opts?.memberResolver;

  const linkedinField = fieldByIdOrName(fields, FIELD_IDS.linkedin, FIELD_NAMES.linkedin);
  const jobTitleField = fieldByIdOrName(fields, FIELD_IDS.jobTitle, FIELD_NAMES.jobTitle);
  const locationField = fieldByIdOrName(fields, FIELD_IDS.location, 'Location');
  const locationCityField = fields.find((f) => f.name === FIELD_NAMES.locationCity);
  const industryField = fieldByIdOrName(fields, FIELD_IDS.industry, 'Industry');
  const lpTypeField = fields.find((f) => f.name === FIELD_NAMES.lpType);
  const investorTypeField = fields.find((f) => f.name === FIELD_NAMES.investorType);
  const sectorField = fields.find((f) => f.name === FIELD_NAMES.sectorFocus);
  const stageField = fields.find((f) => f.name === FIELD_NAMES.stagePreference);
  const checkSizeField = fields.find((f) => f.name === FIELD_NAMES.checkSize);
  const companiesField = fieldByIdOrName(fields, FIELD_IDS.companies, 'Organizations');

  const lastContactField = fieldByIdOrName(fields, FIELD_IDS.lastContact, 'Last Contact');
  const lastEmailField = fieldByIdOrName(fields, FIELD_IDS.lastEmail, 'Last Email');
  const introField = fieldByIdOrName(fields, FIELD_IDS.sourceOfIntroduction, 'Source of Introduction');
  const keyContactField = fields.find((f) => f.name === FIELD_NAMES.keyContact);
  const lpStageField = fields.find((f) => f.name === FIELD_NAMES.lpStage);

  const checkRaw = checkSizeField?.value?.data;
  const checkUsd = typeof checkRaw === 'number' && Number.isFinite(checkRaw) ? checkRaw : null;

  const profile: AffinityProfileFallbacks = {};
  const linkedin = strData(linkedinField);
  if (linkedin) profile.linkedinUrl = linkedin;
  const title = strData(jobTitleField);
  if (title) profile.title = title;
  const geo =
    formatLocation(locationField?.value?.data) ?? strData(locationCityField) ?? dropdownText(locationCityField);
  if (geo) profile.geoFocus = geo;
  const investorType = mapInvestorType(dropdownText(lpTypeField), dropdownMultiTexts(investorTypeField).join(', '));
  if (investorType) profile.investorType = investorType;
  const sectors = normalizeSectorTokens(
    [...textMulti(industryField), ...dropdownMultiTexts(sectorField), strData(sectorField) ?? ''].filter(Boolean)
  );
  if (sectors) profile.sectorTags = sectors;
  const stage = mapStagePreference(strData(stageField));
  if (stage) profile.stageFocus = stage;
  const checkSize = mapCheckSizeUsd(checkUsd);
  if (checkSize) profile.checkSizeRange = checkSize;
  const firmDomain = firmDomainFromCompanies(companiesField);
  if (firmDomain) profile.firmDomain = firmDomain;

  const affinityData: AffinityData = {};
  const lastContact = extractInteraction(lastContactField, resolver);
  if (lastContact) affinityData.lastContact = lastContact;
  const lastEmail = extractInteraction(lastEmailField, resolver);
  if (lastEmail) affinityData.lastEmail = lastEmail;
  const intro = extractPersonRef(introField, resolver);
  if (intro) affinityData.sourceOfIntroduction = intro;
  const keyContact = extractPersonRef(keyContactField, resolver);
  if (keyContact) affinityData.keyContact = keyContact;
  const lpStage = dropdownText(lpStageField);
  if (lpStage) affinityData.lpStage = lpStage;

  return { profile, affinityData };
}
