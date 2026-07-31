/**
 * Pure helpers for merging duplicate MasterProfiles and rewiring Warm Intros v2 graph refs.
 * Used by scripts/merge-master-profiles.ts (LAB-2187).
 */

export type MasterProfileMergeRow = {
  uid: string;
  personKey: string;
  types: string[];
  canonicalName: string;
  memberUid: string | null;
  affinityPersonId: string | null;
  investorOutreachId: string | null;
  emails: unknown;
  phones: unknown;
  socials: unknown;
  organizations: unknown;
  experience: unknown;
  education: unknown;
  investorMeta: unknown;
  funds: unknown;
  investedIn: unknown;
  locations: unknown;
  listMemberships: unknown;
  raw: unknown;
  sourceSnapshots: unknown;
  currentOrg: string | null;
  currentTitle: string | null;
  bio: string | null;
  contentHash: string | null;
  enrichmentVersion: string | null;
  enrichedAt: Date | null;
};

export type ConnectionEdgeMergeRow = {
  uid: string;
  fromProfileUid: string;
  toProfileUid: string;
  relationKind: string;
  score: number;
  confidence: number;
  method: string;
  reasons: unknown;
  hintsUsed: unknown;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  runId: string | null;
  contentHash: string | null;
};

export type WarmPathV2MergeRow = {
  uid: string;
  targetProfileUid: string;
  targetSet: string;
  rank: number;
  score: number;
  hopCount: number;
  hopChain: unknown;
  bestConnectorProfileUid: string | null;
  alternateConnectorProfileUids: unknown;
  runId: string | null;
  computedAt: Date;
};

export type MergedProfileFields = Omit<MasterProfileMergeRow, 'uid'>;

export type EdgeRewirePlan = {
  /** Edges to update in place (uid → new from/to). */
  updates: Array<{ uid: string; fromProfileUid: string; toProfileUid: string }>;
  /** Edge uids to delete (lost unique-key collision; lower score kept out). */
  deleteUids: string[];
};

export type PathRewirePlan = {
  updates: Array<{
    uid: string;
    targetProfileUid: string;
    rank: number;
    score: number;
    hopCount: number;
    hopChain: unknown;
    bestConnectorProfileUid: string | null;
    alternateConnectorProfileUids: unknown;
  }>;
  deleteUids: string[];
};

const PERSON_KEY_PREFIX_RANK: Record<string, number> = {
  email: 50,
  linkedin: 40,
  affinity: 30,
  member: 20,
  nameorg: 10,
};

export function personKeyStrength(personKey: string): number {
  const prefix = personKey.split(':')[0] ?? '';
  return PERSON_KEY_PREFIX_RANK[prefix] ?? 0;
}

export function pickStrongestPersonKey(keys: string[]): string {
  if (keys.length === 0) throw new Error('pickStrongestPersonKey: empty');
  return [...keys].sort((a, b) => {
    const d = personKeyStrength(b) - personKeyStrength(a);
    if (d !== 0) return d;
    return a.localeCompare(b);
  })[0];
}

function nonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

function preferString(canonical: string | null, others: Array<string | null>): string | null {
  const c = nonEmptyString(canonical);
  if (c) return c;
  for (const o of others) {
    const v = nonEmptyString(o);
    if (v) return v;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function dedupeJsonArray(items: unknown[]): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function mergeJsonArrays(...values: unknown[]): unknown | null {
  const items: unknown[] = [];
  for (const v of values) {
    if (Array.isArray(v)) items.push(...v);
  }
  if (items.length === 0) return null;
  return dedupeJsonArray(items);
}

function mergeJsonObjects(...values: unknown[]): unknown | null {
  const out: Record<string, unknown> = {};
  let any = false;
  // Later values win — call with duplicates first, then canonical so canonical wins.
  for (const v of values) {
    const rec = asRecord(v);
    if (!rec) continue;
    any = true;
    Object.assign(out, rec);
  }
  return any ? out : null;
}

function unionTypes(...typeLists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of typeLists) {
    for (const t of list ?? []) {
      const s = String(t ?? '').trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * Merge duplicate profile rows onto canonical. Keeps canonical identity for empty-fill
 * scalars; takes strongest personKey; unions types / JSON arrays; objects prefer canonical.
 */
export function mergeMasterProfileFields(
  canonical: MasterProfileMergeRow,
  duplicates: MasterProfileMergeRow[]
): MergedProfileFields {
  const all = [canonical, ...duplicates];
  const personKey = pickStrongestPersonKey(all.map((p) => p.personKey));

  return {
    personKey,
    types: unionTypes(...all.map((p) => p.types)),
    canonicalName:
      preferString(
        canonical.canonicalName,
        duplicates.map((d) => d.canonicalName)
      ) ?? canonical.canonicalName,
    memberUid: preferString(
      canonical.memberUid,
      duplicates.map((d) => d.memberUid)
    ),
    affinityPersonId: preferString(
      canonical.affinityPersonId,
      duplicates.map((d) => d.affinityPersonId)
    ),
    investorOutreachId: preferString(
      canonical.investorOutreachId,
      duplicates.map((d) => d.investorOutreachId)
    ),
    emails: mergeJsonArrays(...all.map((p) => p.emails)),
    phones: mergeJsonArrays(...all.map((p) => p.phones)),
    socials: mergeJsonObjects(...duplicates.map((d) => d.socials), canonical.socials),
    organizations: mergeJsonArrays(...all.map((p) => p.organizations)),
    experience: mergeJsonArrays(...all.map((p) => p.experience)),
    education: mergeJsonArrays(...all.map((p) => p.education)),
    investorMeta: mergeJsonObjects(...duplicates.map((d) => d.investorMeta), canonical.investorMeta),
    funds: mergeJsonArrays(...all.map((p) => p.funds)),
    investedIn: mergeJsonArrays(...all.map((p) => p.investedIn)),
    locations: mergeJsonArrays(...all.map((p) => p.locations)),
    listMemberships: mergeJsonArrays(...all.map((p) => p.listMemberships)),
    raw: mergeJsonObjects(...duplicates.map((d) => d.raw), canonical.raw),
    sourceSnapshots: mergeJsonArrays(...all.map((p) => p.sourceSnapshots)),
    currentOrg: preferString(
      canonical.currentOrg,
      duplicates.map((d) => d.currentOrg)
    ),
    currentTitle: preferString(
      canonical.currentTitle,
      duplicates.map((d) => d.currentTitle)
    ),
    bio: preferString(
      canonical.bio,
      duplicates.map((d) => d.bio)
    ),
    contentHash: null,
    enrichmentVersion: preferString(
      canonical.enrichmentVersion,
      duplicates.map((d) => d.enrichmentVersion)
    ),
    enrichedAt: canonical.enrichedAt ?? duplicates.find((d) => d.enrichedAt)?.enrichedAt ?? null,
  };
}

export function buildUidRemap(canonicalUid: string, duplicateUids: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const uid of duplicateUids) {
    if (uid && uid !== canonicalUid) map.set(uid, canonicalUid);
  }
  return map;
}

export function remapUid(uid: string, remap: Map<string, string>): string {
  return remap.get(uid) ?? uid;
}

function remapUidInNode(node: unknown, remap: Map<string, string>): unknown {
  const rec = asRecord(node);
  if (!rec) return node;
  const next = { ...rec };
  if (typeof next.profileUid === 'string') {
    next.profileUid = remapUid(next.profileUid, remap);
  }
  return next;
}

/** Rewrite hopChain hops/alternates profileUid fields. */
export function rewriteHopChain(hopChain: unknown, remap: Map<string, string>): unknown {
  const chain = asRecord(hopChain);
  if (!chain) return hopChain;

  const next: Record<string, unknown> = { ...chain };
  if (Array.isArray(chain.hops)) {
    next.hops = chain.hops.map((h) => remapUidInNode(h, remap));
  }
  if (Array.isArray(chain.alternates)) {
    next.alternates = chain.alternates.map((h) => remapUidInNode(h, remap));
  }
  return next;
}

export function rewriteAlternateConnectorUids(value: unknown, remap: Map<string, string>): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const uid = remapUid(item.trim(), remap);
    if (seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

/**
 * Remap edge endpoints; on unique-key collision keep the higher-score edge.
 */
export function planEdgeRewire(edges: ConnectionEdgeMergeRow[], remap: Map<string, string>): EdgeRewirePlan {
  const updates: EdgeRewirePlan['updates'] = [];
  const deleteUids: string[] = [];

  type Candidate = ConnectionEdgeMergeRow & {
    nextFrom: string;
    nextTo: string;
    changed: boolean;
  };

  const candidates: Candidate[] = edges.map((e) => {
    const nextFrom = remapUid(e.fromProfileUid, remap);
    const nextTo = remapUid(e.toProfileUid, remap);
    return {
      ...e,
      nextFrom,
      nextTo,
      changed: nextFrom !== e.fromProfileUid || nextTo !== e.toProfileUid,
    };
  });

  const byKey = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = `${c.nextFrom}|${c.nextTo}|${c.relationKind}`;
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }

  for (const group of byKey.values()) {
    group.sort((a, b) => {
      const d = b.score - a.score;
      if (d !== 0) return d;
      return a.uid.localeCompare(b.uid);
    });
    const winner = group[0];
    for (let i = 1; i < group.length; i += 1) {
      deleteUids.push(group[i].uid);
    }
    if (winner.changed) {
      updates.push({
        uid: winner.uid,
        fromProfileUid: winner.nextFrom,
        toProfileUid: winner.nextTo,
      });
    }
  }

  return { updates, deleteUids };
}

/**
 * Remap path target/connector uids + hopChain; collapse duplicate (target, targetSet, rank)
 * by keeping higher score, then reassign ranks 1..n per (target, targetSet).
 */
export function planPathRewire(paths: WarmPathV2MergeRow[], remap: Map<string, string>): PathRewirePlan {
  type Candidate = WarmPathV2MergeRow & {
    nextTarget: string;
    nextBest: string | null;
    nextAlts: unknown;
    nextHopChain: unknown;
  };

  const candidates: Candidate[] = paths.map((p) => {
    const nextTarget = remapUid(p.targetProfileUid, remap);
    const nextBest = p.bestConnectorProfileUid ? remapUid(p.bestConnectorProfileUid, remap) : null;
    let nextAlts = rewriteAlternateConnectorUids(p.alternateConnectorProfileUids, remap);
    if (nextBest && nextAlts) {
      nextAlts = nextAlts.filter((uid) => uid !== nextBest);
    }
    return {
      ...p,
      nextTarget,
      nextBest,
      nextAlts: nextAlts ?? p.alternateConnectorProfileUids,
      nextHopChain: rewriteHopChain(p.hopChain, remap),
    };
  });

  const byTargetSet = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = `${c.nextTarget}|${c.targetSet}`;
    const list = byTargetSet.get(key) ?? [];
    list.push(c);
    byTargetSet.set(key, list);
  }

  const updates: PathRewirePlan['updates'] = [];
  const deleteUids: string[] = [];

  for (const group of byTargetSet.values()) {
    group.sort((a, b) => {
      const d = b.score - a.score;
      if (d !== 0) return d;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.uid.localeCompare(b.uid);
    });

    group.forEach((c, index) => {
      const rank = index + 1;
      if (index === 0) {
        const changed =
          c.nextTarget !== c.targetProfileUid ||
          c.nextBest !== c.bestConnectorProfileUid ||
          rank !== c.rank ||
          JSON.stringify(c.nextHopChain) !== JSON.stringify(c.hopChain) ||
          JSON.stringify(c.nextAlts) !== JSON.stringify(c.alternateConnectorProfileUids);
        if (changed) {
          updates.push({
            uid: c.uid,
            targetProfileUid: c.nextTarget,
            rank,
            score: c.score,
            hopCount: c.hopCount,
            hopChain: c.nextHopChain,
            bestConnectorProfileUid: c.nextBest,
            alternateConnectorProfileUids: c.nextAlts,
          });
        } else if (rank !== c.rank) {
          updates.push({
            uid: c.uid,
            targetProfileUid: c.nextTarget,
            rank,
            score: c.score,
            hopCount: c.hopCount,
            hopChain: c.nextHopChain,
            bestConnectorProfileUid: c.nextBest,
            alternateConnectorProfileUids: c.nextAlts,
          });
        }
      } else {
        // Same target+set: keep only best-scoring path as rank-1; drop the rest.
        deleteUids.push(c.uid);
      }
    });
  }

  return { updates, deleteUids };
}
