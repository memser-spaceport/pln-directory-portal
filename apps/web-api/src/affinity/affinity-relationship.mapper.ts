import { AffinityFrequencyTier, AffinityListMembership, AffinityPerson, Prisma } from '@prisma/client';

export type ApiFrequencyTier = 'high' | 'neglected';

export interface RelationshipOwnerDto {
  name: string;
  email?: string | null;
  affinity_person_id?: string | null;
  member_uid?: string | null;
}

export interface LastContactDto {
  date: string;
  method?: string | null;
  summary?: string | null;
}

export interface MonthlyBucketDto {
  label: string;
  count: number;
}

export interface MemberRelationshipDto {
  empty: boolean;
  owner: RelationshipOwnerDto | null;
  last_contact: LastContactDto | null;
  frequency_tier: ApiFrequencyTier | null;
  window_months: number;
  touchpoints_6m: number;
  months: MonthlyBucketDto[];
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TIER_THRESHOLDS = {
  highMinTouchpoints: 8,
  highMaxDaysSinceContact: 60,
} as const;

/** Must match pln-data-enrichment affinity-relationship.util.ts */
export const OWNER_FIELD_IDS = {
  portfolioFounders: 'field-3040811',
  strategicFounders: 'field-4904646',
  portfolioCompanies: 'field-3378414',
} as const;

export type MemberForOwnerResolve = {
  uid: string;
  email: string | null;
  name: string;
};

export function apiTierFromDb(tier: AffinityFrequencyTier | null | undefined): ApiFrequencyTier | null {
  if (!tier) return null;
  return tier.toLowerCase() as ApiFrequencyTier;
}

export function dbTierFromApi(
  tier: ApiFrequencyTier | null | undefined,
): AffinityFrequencyTier | null {
  if (!tier) return null;
  return tier.toUpperCase() as AffinityFrequencyTier;
}

export function normalizeOwnerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function fieldEntry(
  listFields: Prisma.JsonValue | null | undefined,
  fieldId: string,
  fieldName: string,
): { data?: unknown } | null {
  if (!listFields || typeof listFields !== 'object' || Array.isArray(listFields)) return null;
  const map = listFields as Record<string, unknown>;
  const byId = map[fieldId];
  if (byId && typeof byId === 'object' && byId !== null) {
    return byId as { data?: unknown };
  }
  for (const value of Object.values(map)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'name' in value) {
      const entry = value as { name?: string; data?: unknown };
      if (entry.name === fieldName) return entry;
    }
  }
  return null;
}

function personRefFromData(data: unknown): RelationshipOwnerDto | null {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data)) {
    const internal = data.find(
      (item) =>
        item &&
        typeof item === 'object' &&
        (item as { type?: string }).type === 'internal',
    );
    return personRefFromData(internal ?? data[0]);
  }
  const p = data as {
    id?: number;
    firstName?: string;
    lastName?: string;
    primaryEmailAddress?: string;
  };
  const name = `${(p.firstName ?? '').trim()} ${(p.lastName ?? '').trim()}`.trim();
  if (!name) return null;
  const email = (p.primaryEmailAddress ?? '').trim() || null;
  return {
    name,
    email,
    affinity_person_id: typeof p.id === 'number' ? String(p.id) : null,
  };
}

function extractOwnerFromPersonListMemberships(
  memberships: Pick<AffinityListMembership, 'listFields'>[],
): RelationshipOwnerDto | null {
  for (const membership of memberships) {
    const ownersField =
      fieldEntry(membership.listFields, OWNER_FIELD_IDS.portfolioFounders, 'Owners') ??
      fieldEntry(membership.listFields, OWNER_FIELD_IDS.strategicFounders, 'Owners');
    const owner = personRefFromData(ownersField?.data);
    if (owner) return owner;
  }
  return null;
}

export function extractOwnerFromCompanyListMemberships(
  memberships: Pick<AffinityListMembership, 'listFields'>[],
): RelationshipOwnerDto | null {
  for (const membership of memberships) {
    const ownersField = fieldEntry(
      membership.listFields,
      OWNER_FIELD_IDS.portfolioCompanies,
      'Owners',
    );
    const owner = personRefFromData(ownersField?.data);
    if (owner) return owner;
  }
  return null;
}

function rawFieldData(rawFields: Prisma.JsonValue, fieldId: string): unknown {
  if (!rawFields || typeof rawFields !== 'object' || Array.isArray(rawFields)) return null;
  const entry = (rawFields as Record<string, unknown>)[fieldId];
  if (entry && typeof entry === 'object' && entry !== null && 'data' in entry) {
    return (entry as { data?: unknown }).data;
  }
  return null;
}

export function extractOwnerFromLastContactInternal(
  rawFields: Prisma.JsonValue,
): RelationshipOwnerDto | null {
  const data = rawFieldData(rawFields, 'last-contact');
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const from = (data as { from?: { person?: unknown } }).from?.person;
  const p = from as { type?: string } | undefined;
  if (p?.type !== 'internal') return null;
  return personRefFromData(from);
}

export function resolveRelationshipOwner(input: {
  personListMemberships?: Pick<AffinityListMembership, 'listFields'>[];
  companyListMemberships?: Pick<AffinityListMembership, 'listFields'>[];
  keyContact?: string | null;
  rawFields?: Prisma.JsonValue;
}): RelationshipOwnerDto | null {
  const fromPersonList = extractOwnerFromPersonListMemberships(input.personListMemberships ?? []);
  if (fromPersonList) return fromPersonList;

  if (input.companyListMemberships?.length) {
    const fromCompany = extractOwnerFromCompanyListMemberships(input.companyListMemberships);
    if (fromCompany) return fromCompany;
  }

  if (input.rawFields) {
    const fromLastContact = extractOwnerFromLastContactInternal(input.rawFields);
    if (fromLastContact) return fromLastContact;
  }

  const trimmed = input.keyContact?.trim();
  return trimmed ? { name: trimmed } : null;
}

/** @deprecated use resolveRelationshipOwner */
export function extractOwnerFromListMemberships(
  memberships: Pick<AffinityListMembership, 'listFields'>[],
  keyContact?: string | null,
): RelationshipOwnerDto | null {
  return resolveRelationshipOwner({ personListMemberships: memberships, keyContact });
}

export function extractLastContactFromRawFields(
  rawFields: Prisma.JsonValue,
): LastContactDto | null {
  const data = rawFieldData(rawFields, 'last-contact');
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as {
    type?: string;
    subject?: string;
    title?: string;
    sentAt?: string;
    date?: string;
    startTime?: string;
  };
  const date = d.sentAt ?? d.startTime ?? d.date;
  if (typeof date !== 'string' || !date.trim()) return null;
  const summary =
    (typeof d.subject === 'string' && d.subject.trim()) ||
    (typeof d.title === 'string' && d.title.trim()) ||
    null;
  return {
    date: date.trim(),
    method: typeof d.type === 'string' ? d.type : null,
    summary,
  };
}

function daysSince(isoDate: string | null | undefined, reference = new Date()): number | null {
  if (!isoDate) return null;
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((reference.getTime() - parsed) / (24 * 60 * 60 * 1000));
}

export function computeFrequencyTierFromSignals(input: {
  touchpoints6m: number;
  lastContactAt?: Date | string | null;
  reference?: Date;
}): ApiFrequencyTier | null {
  const lastIso =
    input.lastContactAt instanceof Date
      ? input.lastContactAt.toISOString()
      : input.lastContactAt ?? null;
  const { touchpoints6m } = input;
  const days = daysSince(lastIso, input.reference ?? new Date());
  if (touchpoints6m === 0 && !lastIso) return null;

  const t = TIER_THRESHOLDS;
  if (
    touchpoints6m >= t.highMinTouchpoints &&
    days !== null &&
    days <= t.highMaxDaysSinceContact
  ) {
    return 'high';
  }
  if (touchpoints6m > 0 || lastIso) return 'neglected';
  return null;
}

function parseMonthlyBuckets(value: Prisma.JsonValue | null | undefined): MonthlyBucketDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as { label?: unknown; count?: unknown };
      if (typeof r.label !== 'string') return null;
      const count = typeof r.count === 'number' ? r.count : 0;
      return { label: r.label, count };
    })
    .filter((r): r is MonthlyBucketDto => r !== null);
}

function emptyBuckets(windowMonths: number): MonthlyBucketDto[] {
  const ref = new Date();
  const buckets: MonthlyBucketDto[] = [];
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - (windowMonths - 1), 1));
  const cursor = new Date(start);
  const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  while (cursor <= end) {
    buckets.push({ label: MONTH_LABELS[cursor.getUTCMonth()], count: 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return buckets;
}

export type AffinityPersonRelationshipSource = AffinityPerson & {
  listMemberships?: AffinityListMembership[];
  primaryCompany?: { listMemberships?: AffinityListMembership[] } | null;
  relationshipOwnerMember?: { uid: string; name: string } | null;
};

export function toMemberRelationshipDto(
  person: AffinityPersonRelationshipSource,
  membersForResolve?: MemberForOwnerResolve[],
): MemberRelationshipDto {
  const windowMonths = person.interactionWindowMonths ?? 6;

  let owner: RelationshipOwnerDto | null = person.relationshipOwnerName
    ? {
        name: person.relationshipOwnerName,
        email: person.relationshipOwnerEmail,
        affinity_person_id: person.relationshipOwnerAffinityPersonId,
        member_uid:
          person.relationshipOwnerMemberUid ??
          person.relationshipOwnerMember?.uid ??
          null,
      }
    : null;

  let lastContact: LastContactDto | null = null;
  if (person.lastContactAt || person.lastContactSummary) {
    lastContact = {
      date: person.lastContactAt?.toISOString() ?? '',
      method: person.lastContactMethod,
      summary: person.lastContactSummary,
    };
  }

  let touchpoints6m = person.touchpoints6m ?? 0;
  let months = parseMonthlyBuckets(person.touchpointsByMonth);
  let frequencyTier = apiTierFromDb(person.frequencyTier);

  if (!owner) {
    owner = resolveRelationshipOwner({
      personListMemberships: person.listMemberships,
      companyListMemberships: person.primaryCompany?.listMemberships,
      keyContact: person.keyContact,
      rawFields: person.rawFields,
    });
  }

  if (!lastContact?.date && person.rawFields) {
    const parsed = extractLastContactFromRawFields(person.rawFields);
    if (parsed) {
      lastContact = parsed;
    } else if (person.lastContactAt) {
      lastContact = { date: person.lastContactAt.toISOString(), method: null, summary: null };
    }
  }

  if (frequencyTier === null && (touchpoints6m > 0 || person.lastContactAt)) {
    frequencyTier = computeFrequencyTierFromSignals({
      touchpoints6m,
      lastContactAt: lastContact?.date ?? person.lastContactAt,
    });
  }

  if (months.length === 0) {
    months = emptyBuckets(windowMonths);
  }

  if (owner && !owner.member_uid && membersForResolve?.length) {
    const resolvedUid = resolveOwnerMemberUid(owner, membersForResolve);
    if (resolvedUid) owner = { ...owner, member_uid: resolvedUid };
  }

  const empty =
    !owner?.name &&
    !lastContact?.date &&
    touchpoints6m === 0 &&
    frequencyTier === null;

  return {
    empty,
    owner,
    last_contact: lastContact?.date ? lastContact : null,
    frequency_tier: empty ? null : frequencyTier,
    window_months: windowMonths,
    touchpoints_6m: touchpoints6m,
    months,
  };
}

export function resolveOwnerMemberUid(
  owner: { name?: string | null; email?: string | null },
  members: MemberForOwnerResolve[],
): string | null {
  const email = owner.email?.trim().toLowerCase();
  if (email) {
    const byEmail = members.find((m) => (m.email ?? '').trim().toLowerCase() === email);
    if (byEmail) return byEmail.uid;
  }

  const normalized = owner.name ? normalizeOwnerName(owner.name) : '';
  if (!normalized) return null;

  const matches = members.filter((m) => normalizeOwnerName(m.name) === normalized);
  return matches.length === 1 ? matches[0].uid : null;
}
