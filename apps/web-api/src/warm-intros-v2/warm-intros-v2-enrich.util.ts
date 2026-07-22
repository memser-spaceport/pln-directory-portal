/**
 * Denormalize MasterProfile fields for Warm Intros v2 path list/detail responses.
 * Pure helpers — tolerant of Sourced wrappers / loose Json shapes.
 */

import { computeWarmPathProximity } from './warm-intros-v2-proximity.util';

export type EnrichedInvestorSummary = {
  profileUid: string;
  personKey: string;
  name: string;
  email: string | null;
  currentOrg: string | null;
  currentTitle: string | null;
  sectors: string[];
  affinityPersonId: string | null;
  memberUid: string | null;
  /** Directory Member image URL when memberUid is linked. */
  imageUrl: string | null;
};

export type EnrichedConnectorSummary = {
  profileUid: string;
  personKey: string;
  name: string;
  currentOrg: string | null;
  currentTitle: string | null;
  memberUid: string | null;
  imageUrl: string | null;
};

export type PathSummary = {
  explanation: string | null;
  alternateCount: number;
};

/** MasterProfile row fields used for enrichment (subset). */
export type MasterProfileEnrichRow = {
  uid: string;
  personKey: string;
  canonicalName: string;
  emails?: unknown;
  currentOrg?: string | null;
  currentTitle?: string | null;
  investorMeta?: unknown;
  affinityPersonId?: string | null;
  memberUid?: string | null;
  /** Filled by service when Member.image is resolved. */
  imageUrl?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Unwrap Sourced<string>[] (or plain string[]) → primary/first email.
 */
export function unwrapPrimaryEmail(emails: unknown): string | null {
  if (!Array.isArray(emails) || emails.length === 0) return null;
  for (const item of emails) {
    if (typeof item === 'string' && item.trim()) return item.trim();
    const rec = asRecord(item);
    if (!rec) continue;
    const value = rec.value;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Tolerant parse of investorMeta.sectors (string[] | Sourced[] | comma string).
 */
export function parseInvestorSectors(investorMeta: unknown): string[] {
  const meta = asRecord(investorMeta);
  if (!meta) return [];
  const raw = meta.sectors;
  if (raw == null) return [];

  if (typeof raw === 'string') {
    return raw
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(raw)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let s: string | null = null;
    if (typeof item === 'string') s = item.trim();
    else {
      const rec = asRecord(item);
      if (rec && typeof rec.value === 'string') s = rec.value.trim();
    }
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function toInvestorSummary(
  profileUid: string,
  profile: MasterProfileEnrichRow | null | undefined
): EnrichedInvestorSummary {
  if (!profile) {
    return {
      profileUid,
      personKey: '',
      name: profileUid,
      email: null,
      currentOrg: null,
      currentTitle: null,
      sectors: [],
      affinityPersonId: null,
      memberUid: null,
      imageUrl: null,
    };
  }
  return {
    profileUid: profile.uid,
    personKey: profile.personKey,
    name: profile.canonicalName || profileUid,
    email: unwrapPrimaryEmail(profile.emails),
    currentOrg: profile.currentOrg ?? null,
    currentTitle: profile.currentTitle ?? null,
    sectors: parseInvestorSectors(profile.investorMeta),
    affinityPersonId: profile.affinityPersonId ?? null,
    memberUid: profile.memberUid ?? null,
    imageUrl: profile.imageUrl ?? null,
  };
}

export function toConnectorSummary(
  profileUid: string | null | undefined,
  profile: MasterProfileEnrichRow | null | undefined
): EnrichedConnectorSummary | null {
  if (!profileUid) return null;
  if (!profile) {
    return {
      profileUid,
      personKey: '',
      name: profileUid,
      currentOrg: null,
      currentTitle: null,
      memberUid: null,
      imageUrl: null,
    };
  }
  return {
    profileUid: profile.uid,
    personKey: profile.personKey,
    name: profile.canonicalName || profileUid,
    currentOrg: profile.currentOrg ?? null,
    currentTitle: profile.currentTitle ?? null,
    memberUid: profile.memberUid ?? null,
    imageUrl: profile.imageUrl ?? null,
  };
}

function reasonDescription(reason: unknown): string | null {
  if (typeof reason === 'string' && reason.trim()) return reason.trim();
  const rec = asRecord(reason);
  if (!rec) return null;
  for (const key of ['description', 'text', 'reason', 'summary']) {
    const v = rec[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Best explanation + alternate count from hopChain / alternateConnectorProfileUids.
 */
export function buildPathSummary(hopChain: unknown, alternateConnectorProfileUids: unknown): PathSummary {
  let explanation: string | null = null;
  let alternateCount = 0;

  if (Array.isArray(alternateConnectorProfileUids)) {
    alternateCount = alternateConnectorProfileUids.length;
  }

  const chain = asRecord(hopChain);
  if (chain) {
    if (Array.isArray(chain.alternates) && chain.alternates.length > alternateCount) {
      alternateCount = chain.alternates.length;
    }

    const reasons = Array.isArray(chain.reasons) ? chain.reasons : [];
    for (const r of reasons) {
      explanation = reasonDescription(r);
      if (explanation) break;
    }

    if (!explanation && Array.isArray(chain.hops)) {
      for (const hop of chain.hops) {
        const hopRec = asRecord(hop);
        if (!hopRec || !Array.isArray(hopRec.reasons)) continue;
        for (const r of hopRec.reasons) {
          explanation = reasonDescription(r);
          if (explanation) break;
        }
        if (explanation) break;
      }
    }
  }

  return { explanation, alternateCount };
}

/**
 * Fill hop + alternate nodes with name / memberUid / imageUrl from MasterProfile map.
 * Alternates also get proximityCode / caliber / scorePercent / scoreBand (same rules as rank-1 path).
 */
export function enrichHopChainNames(
  hopChain: unknown,
  profilesByUid: Map<string, MasterProfileEnrichRow>,
  hopCount: number = 1
): unknown {
  const chain = asRecord(hopChain);
  if (!chain) return hopChain;

  const enrichProfileFields = (node: unknown): Record<string, unknown> | null => {
    const hopRec = asRecord(node);
    if (!hopRec) return null;
    const uid = typeof hopRec.profileUid === 'string' ? hopRec.profileUid : null;
    if (!uid) return hopRec;
    const profile = profilesByUid.get(uid);
    const next: Record<string, unknown> = { ...hopRec };
    const hasName = typeof hopRec.name === 'string' && hopRec.name.trim() !== '';
    if (!hasName && profile?.canonicalName) next.name = profile.canonicalName;
    if (profile?.memberUid != null) next.memberUid = profile.memberUid;
    if (profile?.imageUrl !== undefined) next.imageUrl = profile.imageUrl;
    return next;
  };

  const enrichAlternate = (node: unknown): unknown => {
    const next = enrichProfileFields(node);
    if (!next) return node;
    const score = typeof next.score === 'number' ? next.score : 0;
    const proximity = computeWarmPathProximity({
      score,
      hopCount,
      hopChain: chain,
      relationKind: typeof chain.relationKind === 'string' ? chain.relationKind : null,
    });
    next.proximityCode = proximity.proximityCode;
    next.caliber = proximity.caliber;
    next.scorePercent = proximity.scorePercent;
    next.scoreBand = proximity.scoreBand;
    return next;
  };

  const hops = Array.isArray(chain.hops)
    ? chain.hops.map((n) => enrichProfileFields(n) ?? n)
    : chain.hops;
  const alternates = Array.isArray(chain.alternates) ? chain.alternates.map(enrichAlternate) : chain.alternates;

  return { ...chain, hops, alternates };
}

export function matchesSearch(investor: EnrichedInvestorSummary, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  if (investor.name.toLowerCase().includes(q)) return true;
  if (investor.email && investor.email.toLowerCase().includes(q)) return true;
  return false;
}

export function matchesSector(investor: EnrichedInvestorSummary, sector: string): boolean {
  const needle = sector.trim().toLowerCase();
  if (!needle) return true;
  return investor.sectors.some((s) => s.toLowerCase() === needle || s.toLowerCase().includes(needle));
}
