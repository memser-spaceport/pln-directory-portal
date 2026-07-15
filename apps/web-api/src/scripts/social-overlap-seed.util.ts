/**
 * Social overlap cache consumer for pathfinder neuro/gold seed.
 * Reads `_social_overlap_cache.json` produced by pln-data-enrichment compute-social-overlaps.
 * Logic mirrors enrichment path-pl-people-resolve + social-overlap (no cross-repo imports).
 */

import { comparePathsByWarmth } from './affinity-warmth-boost.util';

export type SocialOverlapKind =
  | 'concurrent_employment'
  | 'same_company_unknown_dates'
  | 'same_school'
  | 'same_school_unknown_dates';

export type SocialOverlapConfidence = 'high' | 'medium' | 'low';

export interface YearRange {
  start: number;
  end: number | null;
}

export interface SocialOverlapEntry {
  investorId: string;
  plPersonKey: string;
  plName: string;
  kind: SocialOverlapKind;
  label: string;
  companyKey?: string;
  schoolKey?: string;
  confidence: SocialOverlapConfidence;
  affectsScore: boolean;
  evidenceUrls: string[];
  overlapYears?: YearRange;
}

export type SocialOverlapCache = Record<string, SocialOverlapEntry>;

/** Cap for pathWarmth = pathScore + linkedInBonus (LAB-2108). */
export const PATH_WARMTH_SCORE_CAP = 1.0;

/** Verified overlapping work or education. */
export const LINKEDIN_BONUS_VERIFIED = 0.25;
/** Same company/school without verified overlapping dates. */
export const LINKEDIN_BONUS_UNVERIFIED = 0.1;
/**
 * Extra when PL connector has a 1st-degree LinkedIn connection to the investor.
 * Omitted until connection data exists (LAB-2108) — keep constant for follow-up.
 */
export const LINKEDIN_BONUS_FIRST_DEGREE = 0.1;

export type AttributionSource = 'Affinity' | 'LinkedIn';

export interface AttributionLine {
  source: AttributionSource;
  text: string;
}

export interface HopChainContact {
  name?: string;
  role?: string;
  email?: string;
  memberUid?: string;
  affinityId?: string | number;
  investorId?: string | number;
  source?: string;
  linkedin?: string;
}

export interface HopChainRouteNode {
  label?: string;
  orgName?: string;
  role?: string;
  variant?: string;
  memberUid?: string;
  contacts?: HopChainContact[];
}

export interface HopChainGraphNode {
  id: string;
  label?: string;
  type?: string;
}

export interface HopChainGraphEdge {
  from: string;
  to: string;
  connectorType?: string;
}

export interface HopChainPlConnector {
  name?: string;
  internalId?: number;
  memberUid?: string;
}

export interface HopChainConnectorTeam {
  name?: string;
  leads?: HopChainContact[];
}

export interface PathHopChain {
  nodes?: HopChainGraphNode[];
  edges?: HopChainGraphEdge[];
  contact?: HopChainContact;
  connectorTeam?: HopChainConnectorTeam;
  plConnector?: HopChainPlConnector;
  routeNodes?: HopChainRouteNode[];
  orgConnector?: { contacts?: HopChainContact[] };
  orgConnectors?: Array<{ contacts?: HopChainContact[] }>;
}

export interface PlPathPerson {
  personKey: string;
  name: string;
  firm?: string | null;
  memberUid?: string;
  investorId?: string;
  source: string;
}

interface PersonIdentity {
  name: string;
  firm?: string | null;
  memberUid?: string;
  investorId?: string;
}

const FOUNDER_NODE_ID_RE = /^f_/;

function normName(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function prestigeCacheKey(name: string, firm?: string | null): string {
  return `${normName(name)}||${normName(firm)}`;
}

function resolvePersonKey(identity: PersonIdentity): string {
  if (identity.investorId) return `investor:${identity.investorId}`;
  if (identity.memberUid) return `member:${identity.memberUid}`;
  return `person:${prestigeCacheKey(identity.name, identity.firm)}`;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return asString(value);
}

function identityFromContact(contact: HopChainContact, firm?: string | null): PersonIdentity | null {
  const name = asString(contact.name);
  if (!name) return null;
  return {
    name,
    firm,
    memberUid: asString(contact.memberUid),
    investorId: asId(contact.investorId) ?? asId(contact.affinityId),
  };
}

function addPerson(
  out: Map<string, PlPathPerson>,
  partial: Omit<PlPathPerson, 'personKey'> & { identity?: PersonIdentity }
): void {
  const identity: PersonIdentity = partial.identity ?? {
    name: partial.name,
    firm: partial.firm,
    memberUid: partial.memberUid,
    investorId: partial.investorId,
  };
  const personKey = resolvePersonKey(identity);
  if (out.has(personKey)) return;
  out.set(personKey, {
    personKey,
    name: partial.name,
    firm: partial.firm,
    memberUid: partial.memberUid ?? identity.memberUid,
    investorId: partial.investorId ?? identity.investorId,
    source: partial.source,
  });
}

function collectTargetSideContacts(hopChain: PathHopChain): HopChainContact[] {
  const contacts: HopChainContact[] = [];
  if (hopChain.contact) contacts.push(hopChain.contact);
  for (const lead of hopChain.connectorTeam?.leads ?? []) {
    contacts.push(lead);
  }
  for (const node of hopChain.routeNodes ?? []) {
    if (node.variant === 'external') {
      contacts.push(...(node.contacts ?? []));
      if (node.label) {
        contacts.push({
          name: node.label,
          memberUid: node.memberUid,
          role: node.orgName,
        });
      }
    }
  }
  for (const org of [hopChain.orgConnector, ...(hopChain.orgConnectors ?? [])]) {
    contacts.push(...(org?.contacts ?? []));
  }
  return contacts;
}

/** Collect personKeys for the target LP/investor so they can be excluded from PL-side people. */
export function resolveTargetInvestorPersonKeys(hopChain: PathHopChain, targetInvestorId: string): Set<string> {
  const keys = new Set<string>();

  if (/^\d+$/.test(targetInvestorId)) {
    keys.add(`investor:${targetInvestorId}`);
  }

  for (const contact of collectTargetSideContacts(hopChain)) {
    const identity = identityFromContact(contact, asString(contact.role) ?? hopChain.connectorTeam?.name ?? null);
    if (!identity) continue;
    keys.add(resolvePersonKey(identity));
  }

  return keys;
}

function founderNodeIds(hopChain: PathHopChain): Set<string> {
  const ids = new Set<string>();
  for (const node of hopChain.nodes ?? []) {
    if (FOUNDER_NODE_ID_RE.test(node.id)) ids.add(node.id);
  }
  for (const edge of hopChain.edges ?? []) {
    if (edge.from === 'PL' && edge.connectorType === 'F' && edge.to) {
      ids.add(edge.to);
    }
  }
  return ids;
}

export function resolveFounderPersonKey(v8EntityId: string): string {
  return `founder:${v8EntityId}`;
}

export function hasFounderNodes(hopChain: PathHopChain): boolean {
  return founderNodeIds(hopChain).size > 0;
}

export function extractFounderNodes(
  hopChain: PathHopChain,
  resolveMemberUidByName?: (name: string) => string | undefined
): PlPathPerson[] {
  const founderIds = founderNodeIds(hopChain);
  if (founderIds.size === 0) return [];

  const byId = new Map((hopChain.nodes ?? []).map((node) => [node.id, node]));
  const people: PlPathPerson[] = [];

  for (const id of founderIds) {
    const node = byId.get(id);
    const name = asString(node?.label) ?? id.replace(/^f_/, '').replace(/_/g, ' ');
    const memberUid = resolveMemberUidByName?.(name);
    people.push({
      personKey: resolveFounderPersonKey(id),
      name,
      memberUid,
      source: 'nodes.founder',
    });
  }

  return people;
}

function addPlConnector(
  out: Map<string, PlPathPerson>,
  pl: HopChainPlConnector | null | undefined,
  source: string
): void {
  if (!pl?.name && !pl?.memberUid && pl?.internalId == null) return;
  const identity: PersonIdentity = {
    name: asString(pl.name) ?? 'PL connector',
    memberUid: asString(pl.memberUid),
    investorId: pl.internalId != null ? String(pl.internalId) : undefined,
  };
  addPerson(out, {
    identity,
    name: identity.name,
    memberUid: identity.memberUid,
    investorId: identity.investorId,
    source,
  });
}

/** Build member name index key (trim + normName). */
export function memberNameIndexKey(name: string): string {
  return normName(name.trim());
}

/**
 * Extract distinct PL-side people from a path hopChain.
 * PL-side = portfolio founders (f_* nodes), plConnector, routeNodes with memberUid.
 */
export function extractPlPeopleFromHopChain(
  hopChain: PathHopChain,
  excludePersonKeys: Set<string> = new Set(),
  options: { resolveMemberUidByName?: (name: string) => string | undefined } = {}
): PlPathPerson[] {
  const out = new Map<string, PlPathPerson>();

  for (const founder of extractFounderNodes(hopChain, options.resolveMemberUidByName)) {
    if (!out.has(founder.personKey)) out.set(founder.personKey, founder);
  }

  for (const node of hopChain.routeNodes ?? []) {
    if (node.variant === 'member' && node.memberUid) {
      addPerson(out, {
        name: asString(node.label) ?? node.memberUid,
        memberUid: node.memberUid,
        firm: asString(node.orgName) ?? asString(node.role),
        source: 'routeNodes.member',
      });
    }

    for (const contact of node.contacts ?? []) {
      if (!contact.memberUid) continue;
      const identity = identityFromContact(contact, node.orgName ?? node.label ?? null);
      if (!identity) continue;
      addPerson(out, {
        identity,
        name: identity.name,
        firm: identity.firm,
        memberUid: identity.memberUid,
        investorId: identity.investorId,
        source: 'routeNodes.contacts',
      });
    }
  }

  addPlConnector(out, hopChain.plConnector, 'hopChain.plConnector');

  return [...out.values()].filter((p) => !excludePersonKeys.has(p.personKey));
}

export function buildSocialOverlapCacheKey(input: { investorId: string; plPersonKey: string }): string {
  return `pair:investor:${input.investorId}|pl:${input.plPersonKey}`;
}

/** Map hopChain.plConnector to the same personKey used in the overlap cache. */
export function resolvePlConnectorPersonKey(
  pl: HopChainPlConnector,
  resolveMemberUidByName?: (name: string) => string | undefined
): string | null {
  const name = asString(pl.name);
  const memberUid = asString(pl.memberUid) ?? (name ? resolveMemberUidByName?.(name) : undefined);
  const investorId = pl.internalId != null ? String(pl.internalId) : undefined;

  if (!investorId && !memberUid && !name) return null;

  const identity: PersonIdentity = {
    name: name ?? 'PL connector',
    memberUid,
    investorId,
  };
  return resolvePersonKey(identity);
}

/**
 * Collect all founder + PL-connector overlaps for a path (display + max bonus).
 */
export function lookupAllSocialOverlapsForPath(
  cache: SocialOverlapCache,
  input: {
    investorId: string;
    hopChain: PathHopChain;
    resolveMemberUidByName?: (name: string) => string | undefined;
  }
): SocialOverlapEntry[] {
  const out: SocialOverlapEntry[] = [];
  const seen = new Set<string>();

  const push = (hit: SocialOverlapEntry | null | undefined) => {
    if (!hit) return;
    const dedupe = `${hit.plPersonKey}|${hit.kind}|${hit.label}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    out.push(hit);
  };

  for (const founder of extractFounderNodes(input.hopChain, input.resolveMemberUidByName)) {
    const key = buildSocialOverlapCacheKey({
      investorId: input.investorId,
      plPersonKey: founder.personKey,
    });
    push(cache[key]);
  }

  if (input.hopChain.plConnector) {
    push(
      lookupSocialOverlapForPair(cache, {
        investorId: input.investorId,
        plConnector: input.hopChain.plConnector,
        resolveMemberUidByName: input.resolveMemberUidByName,
      })
    );
  }

  return out;
}

/**
 * Lookup overlap for founders on the path first, then hopChain.plConnector.
 * Prefer {@link lookupAllSocialOverlapsForPath} when scoring/attribution need all hits.
 */
export function lookupSocialOverlapForPath(
  cache: SocialOverlapCache,
  input: {
    investorId: string;
    hopChain: PathHopChain;
    resolveMemberUidByName?: (name: string) => string | undefined;
  }
): SocialOverlapEntry | null {
  return lookupAllSocialOverlapsForPath(cache, input)[0] ?? null;
}

/** All cache overlaps for one investor (any PL person). */
export function lookupAllSocialOverlapsForInvestor(
  cache: SocialOverlapCache,
  investorId: string
): SocialOverlapEntry[] {
  return Object.values(cache).filter((e) => e.investorId === investorId);
}

/**
 * Lookup overlap for an investor × PL connector pair after hopChain.plConnector is grafted.
 */
export function lookupSocialOverlapForPair(
  cache: SocialOverlapCache,
  input: {
    investorId: string;
    plConnector: HopChainPlConnector;
    resolveMemberUidByName?: (name: string) => string | undefined;
  }
): SocialOverlapEntry | null {
  const plPersonKey = resolvePlConnectorPersonKey(input.plConnector, input.resolveMemberUidByName);
  if (!plPersonKey) return null;

  const key = buildSocialOverlapCacheKey({
    investorId: input.investorId,
    plPersonKey,
  });
  return cache[key] ?? null;
}

/** True when overlap is verified concurrent work or verified overlapping school years. */
export function isVerifiedSocialOverlap(overlap: SocialOverlapEntry): boolean {
  if (overlap.kind === 'concurrent_employment') return true;
  if (overlap.kind === 'same_school' && overlap.overlapYears != null) return true;
  return false;
}

/** Per-person LinkedIn bonus from a single overlap entry (no 1st-degree tier yet). */
export function linkedInBonusForOverlap(overlap: SocialOverlapEntry): number {
  return isVerifiedSocialOverlap(overlap) ? LINKEDIN_BONUS_VERIFIED : LINKEDIN_BONUS_UNVERIFIED;
}

/**
 * Best single LinkedIn bonus across people on the path (max, no stacking).
 * Groups by plPersonKey; each person contributes their best overlap bonus.
 */
export function linkedInBonusForOverlaps(overlaps: SocialOverlapEntry[]): number {
  if (overlaps.length === 0) return 0;
  const bestByPerson = new Map<string, number>();
  for (const overlap of overlaps) {
    const bonus = linkedInBonusForOverlap(overlap);
    const prev = bestByPerson.get(overlap.plPersonKey) ?? 0;
    if (bonus > prev) bestByPerson.set(overlap.plPersonKey, bonus);
  }
  let max = 0;
  for (const bonus of bestByPerson.values()) {
    if (bonus > max) max = bonus;
  }
  return max;
}

export function applyLinkedInPathWarmth(pathScore: number, overlaps: SocialOverlapEntry[]): number {
  const bonus = linkedInBonusForOverlaps(overlaps);
  return Math.min(PATH_WARMTH_SCORE_CAP, pathScore + bonus);
}

/** Overlaps used for warmth — same resolution as seed finalize. */
export function overlapsForPathWarmth(candidate: {
  linkedInOverlaps?: SocialOverlapEntry[];
  socialOverlap?: SocialOverlapEntry;
}): SocialOverlapEntry[] {
  if (candidate.linkedInOverlaps && candidate.linkedInOverlaps.length > 0) {
    return candidate.linkedInOverlaps;
  }
  if (candidate.socialOverlap) return [candidate.socialOverlap];
  return [];
}

/**
 * Sort key for seed ranking: hops → pathWarmth (pathScore + linkedInBonus) → stable rank.
 * Does not mutate base score — attribution still applies the bonus once at finalize.
 */
export function comparePathCandidatesByFinalWarmth(
  a: {
    hops: number;
    score: number;
    rank?: number;
    linkedInOverlaps?: SocialOverlapEntry[];
    socialOverlap?: SocialOverlapEntry;
  },
  b: {
    hops: number;
    score: number;
    rank?: number;
    linkedInOverlaps?: SocialOverlapEntry[];
    socialOverlap?: SocialOverlapEntry;
  }
): number {
  return comparePathsByWarmth(
    { hops: a.hops, score: applyLinkedInPathWarmth(a.score, overlapsForPathWarmth(a)), rank: a.rank },
    { hops: b.hops, score: applyLinkedInPathWarmth(b.score, overlapsForPathWarmth(b)), rank: b.rank }
  );
}

const EMAIL_KINDS = new Set(['first_email', 'last_email']);

export interface AffinityAttributionConnector {
  name: string;
  strength?: number | null;
  recencyDays?: number | null;
  evidenceKind?: string | null;
  attributionSource?: string | null;
}

function humanizeRecencyDays(days: number | null | undefined): string | null {
  if (days == null || !Number.isFinite(days)) return null;
  if (days <= 1) return 'today';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `~${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `~${Math.round(days / 30)} months ago`;
  return `~${Math.round(days / 365)} years ago`;
}

/**
 * Ticket-style Affinity line, e.g. "Brad Holden last emailed ~4 months ago (tie 0.10)".
 * Returns null when there is nothing useful to say.
 */
export function buildAffinityAttributionText(
  connector: AffinityAttributionConnector | null | undefined
): string | null {
  if (!connector?.name) return null;

  const rec = humanizeRecencyDays(connector.recencyDays ?? null);
  const src = connector.attributionSource;

  let base: string;
  if (src === 'keyContact') {
    base = `${connector.name} is the CRM relationship owner`;
  } else if (src === 'lastEmail' || (connector.evidenceKind && EMAIL_KINDS.has(connector.evidenceKind))) {
    base = rec ? `${connector.name} last emailed ${rec}` : `${connector.name} last emailed`;
  } else if (src === 'lastContact') {
    base = rec ? `${connector.name} last contacted ${rec}` : `${connector.name} last contacted`;
  } else if (rec) {
    const verb = connector.evidenceKind && EMAIL_KINDS.has(connector.evidenceKind) ? 'last emailed' : 'last touched';
    base = `${connector.name} ${verb} ${rec}`;
  } else {
    base = connector.name;
  }

  if (connector.strength != null && Number.isFinite(connector.strength)) {
    return `${base} (tie ${connector.strength.toFixed(2)})`;
  }
  return base.trim() || null;
}

export function buildLinkedInAttributionLines(overlaps: SocialOverlapEntry[]): AttributionLine[] {
  const lines: AttributionLine[] = [];
  const seen = new Set<string>();
  for (const overlap of overlaps) {
    const label = overlap.label?.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    lines.push({ source: 'LinkedIn', text: label });
  }
  return lines;
}

export function buildAttributionLines(input: {
  affinityConnector?: AffinityAttributionConnector | null;
  overlaps?: SocialOverlapEntry[];
}): AttributionLine[] {
  const lines: AttributionLine[] = [];
  const affinityText = buildAffinityAttributionText(input.affinityConnector);
  if (affinityText) {
    lines.push({ source: 'Affinity', text: affinityText });
  }
  lines.push(...buildLinkedInAttributionLines(input.overlaps ?? []));
  return lines;
}

/** Prefer the highest-bonus overlap for the PathfinderPath.socialOverlap column. */
export function pickPrimarySocialOverlap(overlaps: SocialOverlapEntry[]): SocialOverlapEntry | null {
  if (overlaps.length === 0) return null;
  return [...overlaps].sort((a, b) => linkedInBonusForOverlap(b) - linkedInBonusForOverlap(a))[0] ?? null;
}

export function attachAttributionLinesToHopChain(
  hopChain: Record<string, unknown>,
  lines: AttributionLine[]
): Record<string, unknown> {
  const hc: Record<string, unknown> = { ...hopChain };
  if (lines.length > 0) {
    hc.attributionLines = lines;
  } else {
    delete hc.attributionLines;
  }
  return hc;
}

/** @deprecated Prefer attributionLines; kept for callers that still need a flat explanation append. */
export function appendOverlapToHopChain(
  hopChain: Record<string, unknown>,
  overlap: SocialOverlapEntry
): Record<string, unknown> {
  const hc: Record<string, unknown> = { ...hopChain };
  const existing = typeof hc.explanation === 'string' ? hc.explanation : '';
  if (existing.includes(overlap.label)) return hc;
  hc.explanation = existing ? `${existing} ${overlap.label}.` : `${overlap.label}.`;
  return hc;
}

/** @deprecated Replaced by {@link applyLinkedInPathWarmth} (LAB-2108 additive model). */
export function applySocialOverlapScoreBump(score: number, overlap: SocialOverlapEntry | null): number {
  if (!overlap) return score;
  return applyLinkedInPathWarmth(score, [overlap]);
}

export interface LinkedInOnlyPathShape {
  targetInvestorId: string;
  connectorType: string;
  hops: number;
  caliber: string | null;
  caliberConfidence: number | null;
  proximityCode: string;
  score: number;
  hopChain: Record<string, unknown>;
  socialOverlap: SocialOverlapEntry;
}

function founderV8IdFromPersonKey(plPersonKey: string): string | null {
  if (!plPersonKey.startsWith('founder:')) return null;
  return plPersonKey.slice('founder:'.length);
}

function plConnectorFromOverlap(overlap: SocialOverlapEntry): HopChainPlConnector | null {
  if (!overlap.plPersonKey.startsWith('investor:')) return null;
  const id = overlap.plPersonKey.slice('investor:'.length);
  const internalId = /^\d+$/.test(id) ? Number(id) : undefined;
  return {
    name: overlap.plName,
    ...(internalId != null ? { internalId } : {}),
  };
}

/**
 * Overlap evidenceUrls are [investorProfile, plPersonProfile]. Prefer the PL-side URL
 * for founder/PL-connector contact cards.
 */
export function plPersonLinkedInFromOverlap(overlap: SocialOverlapEntry): string | undefined {
  const urls = overlap.evidenceUrls ?? [];
  const plUrl = urls[1] ?? urls.find((u) => /linkedin\.com\/in\//i.test(u));
  return typeof plUrl === 'string' && plUrl.trim() ? plUrl.trim() : undefined;
}

/**
 * Synthetic 1-hop warm path from LinkedIn education/experience overlap when no
 * graph/Affinity path exists. Connector type: F for founders, PL for venture leads.
 */
export function buildLinkedInOnlyPath(input: {
  targetInvestorId: string;
  overlap: SocialOverlapEntry;
  caliber?: string | null;
  caliberConfidence?: number | null;
}): LinkedInOnlyPathShape {
  const { targetInvestorId, overlap } = input;
  const caliber = input.caliber ?? 'B';
  const caliberConfidence = input.caliberConfidence ?? 0.4;
  const founderId = founderV8IdFromPersonKey(overlap.plPersonKey);
  const isFounder = founderId != null;
  // Founder LinkedIn-only = PL org → founder → investor (same shape as graph F paths).
  // Direct PL+1 only when the overlap person is a PL venture-lead connector.
  const connectorType = isFounder ? 'F' : 'PL';
  const hops = isFounder ? 2 : 1;
  const proximityCode = `${connectorType}+${hops}${caliber}`;
  const pathScore = 0;
  // Seed applies linkedInBonus via applyPathAttributionAndWarmth; keep base at 0 here.
  const score = pathScore;
  const attributionLines = buildLinkedInAttributionLines([overlap]);
  const plLinkedIn = plPersonLinkedInFromOverlap(overlap);

  const plConnector = isFounder ? undefined : plConnectorFromOverlap(overlap);
  const nodes = isFounder
    ? [
        { id: 'PL', label: 'Protocol Labs', type: 'org' },
        { id: founderId, label: overlap.plName, type: 'org' },
        { id: targetInvestorId, label: 'Investor', type: 'person' },
      ]
    : [
        { id: 'PL', label: 'Protocol Labs', type: 'org' },
        { id: targetInvestorId, label: 'Investor', type: 'person' },
      ];
  const edges = isFounder
    ? [
        { from: 'PL', to: founderId, connectorType: 'F', provenance: 'linkedin-overlap' },
        {
          from: founderId,
          to: targetInvestorId,
          connectorType: 'F',
          probability: score,
          provenance: 'linkedin-overlap',
        },
      ]
    : [
        {
          from: 'PL',
          to: targetInvestorId,
          connectorType: 'PL',
          probability: score,
          evidence: overlap.kind,
          provenance: 'linkedin-overlap',
        },
      ];

  return {
    targetInvestorId,
    connectorType,
    hops,
    caliber,
    caliberConfidence,
    proximityCode,
    score,
    socialOverlap: overlap,
    hopChain: {
      nodes,
      edges,
      explanation: '',
      attributionLines,
      ...(plConnector ? { plConnector } : {}),
      ...(isFounder
        ? {
            contact: {
              name: overlap.plName,
              role: 'Founder',
              source: 'linkedin-overlap',
              ...(plLinkedIn ? { linkedin: plLinkedIn } : {}),
            },
          }
        : {}),
    },
  };
}

/**
 * Best overlap within a set (highest bonus, then label).
 * Used to pick the primary overlap for a single plPersonKey group — not investor-wide.
 */
export function pickBestLinkedInOnlyOverlap(overlaps: SocialOverlapEntry[]): SocialOverlapEntry | null {
  if (overlaps.length === 0) return null;
  return (
    [...overlaps].sort((a, b) => {
      const db = linkedInBonusForOverlap(b) - linkedInBonusForOverlap(a);
      if (db !== 0) return db;
      return a.label.localeCompare(b.label);
    })[0] ?? null
  );
}

/** True when hopChain already represents this founder or PL connector (exact personKey). */
export function pathMatchesPlPersonKey(
  hopChain: PathHopChain,
  plPersonKey: string,
  resolveMemberUidByName?: (name: string) => string | undefined
): boolean {
  for (const founder of extractFounderNodes(hopChain, resolveMemberUidByName)) {
    if (founder.personKey === plPersonKey) return true;
  }
  if (hopChain.plConnector) {
    const key = resolvePlConnectorPersonKey(hopChain.plConnector, resolveMemberUidByName);
    if (key === plPersonKey) return true;
  }
  return false;
}

export function groupSocialOverlapsByPlPersonKey(overlaps: SocialOverlapEntry[]): Map<string, SocialOverlapEntry[]> {
  const map = new Map<string, SocialOverlapEntry[]>();
  for (const overlap of overlaps) {
    const list = map.get(overlap.plPersonKey) ?? [];
    list.push(overlap);
    map.set(overlap.plPersonKey, list);
  }
  return map;
}

function dedupeOverlaps(overlaps: SocialOverlapEntry[]): SocialOverlapEntry[] {
  const out: SocialOverlapEntry[] = [];
  const seen = new Set<string>();
  for (const overlap of overlaps) {
    const key = `${overlap.plPersonKey}|${overlap.kind}|${overlap.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(overlap);
  }
  return out;
}

export function findCandidateMatchingPlPersonKey<T extends { hopChain: PathHopChain | Record<string, unknown> }>(
  candidates: T[],
  plPersonKey: string,
  resolveMemberUidByName?: (name: string) => string | undefined
): number {
  return candidates.findIndex((c) =>
    pathMatchesPlPersonKey(c.hopChain as PathHopChain, plPersonKey, resolveMemberUidByName)
  );
}

export type LinkedInMergeCandidate = {
  hopChain: PathHopChain | Record<string, unknown>;
  score: number;
  socialOverlap?: SocialOverlapEntry;
  /** Overlaps assigned at merge time — finalize must use these (no post-graft re-lookup). */
  linkedInOverlaps?: SocialOverlapEntry[];
  /** Synthetic LinkedIn-only path; Affinity graft/attribution only if same person. */
  linkedInOnly?: boolean;
};

/**
 * For each plPersonKey among investor overlaps:
 * - matching founder/PL connector path → merge overlaps (score/attribution applied once in finalize)
 * - no match → create a LinkedIn-only path (all unmatched people, not top-1)
 *
 * Multiple overlap kinds for the same person → one path with multiple LinkedIn attribution lines.
 */
export function mergeOrCreateLinkedInPathCandidates<T extends LinkedInMergeCandidate>(
  candidates: T[],
  overlaps: SocialOverlapEntry[],
  input: {
    targetInvestorId: string;
    caliber?: string | null;
    caliberConfidence?: number | null;
    resolveMemberUidByName?: (name: string) => string | undefined;
  }
): T[] {
  if (overlaps.length === 0) {
    return candidates.map((c) => ({
      ...c,
      linkedInOverlaps: c.linkedInOverlaps ? [...c.linkedInOverlaps] : [],
    }));
  }

  const result: T[] = candidates.map((c) => ({
    ...c,
    linkedInOverlaps: c.linkedInOverlaps ? [...c.linkedInOverlaps] : [],
  }));

  for (const [, personOverlaps] of groupSocialOverlapsByPlPersonKey(overlaps)) {
    const plPersonKey = personOverlaps[0]?.plPersonKey;
    if (!plPersonKey) continue;

    const matchIdx = findCandidateMatchingPlPersonKey(result, plPersonKey, input.resolveMemberUidByName);

    if (matchIdx >= 0) {
      const matched = result[matchIdx];
      const merged = dedupeOverlaps([...(matched.linkedInOverlaps ?? []), ...personOverlaps]);
      result[matchIdx] = {
        ...matched,
        linkedInOverlaps: merged,
        socialOverlap: pickPrimarySocialOverlap(merged) ?? matched.socialOverlap,
      };
      continue;
    }

    const primary = pickBestLinkedInOnlyOverlap(personOverlaps);
    if (!primary) continue;

    const liPath = buildLinkedInOnlyPath({
      targetInvestorId: input.targetInvestorId,
      overlap: primary,
      caliber: input.caliber ?? 'B',
      caliberConfidence: input.caliberConfidence ?? 0.4,
    });

    result.push({
      ...(liPath as unknown as T),
      linkedInOverlaps: dedupeOverlaps(personOverlaps),
      linkedInOnly: true,
      socialOverlap: primary,
    });
  }

  return result;
}

/**
 * Affinity plConnector graft / attribution:
 * - graph + Affinity-direct paths: always (investor-level CRM, as today)
 * - LinkedIn-only: only when the LI person is that same Affinity connector
 */
export function shouldAttachAffinityToPath(input: {
  linkedInOnly?: boolean;
  hopChain: PathHopChain;
  affinityConnector?: HopChainPlConnector | null;
  resolveMemberUidByName?: (name: string) => string | undefined;
}): boolean {
  if (!input.affinityConnector?.name && input.affinityConnector?.internalId == null) {
    return false;
  }
  if (!input.linkedInOnly) return true;
  const key = resolvePlConnectorPersonKey(input.affinityConnector, input.resolveMemberUidByName);
  if (!key) return false;
  return pathMatchesPlPersonKey(input.hopChain, key, input.resolveMemberUidByName);
}

/**
 * Attach attribution lines + additive LinkedIn warmth for a seeded path.
 * Does not mutate explanation (Affinity/LinkedIn stay out of the narrative blob).
 */
export function applyPathAttributionAndWarmth(input: {
  hopChain: Record<string, unknown>;
  pathScore: number;
  affinityConnector?: AffinityAttributionConnector | null;
  overlaps: SocialOverlapEntry[];
}): {
  hopChain: Record<string, unknown>;
  score: number;
  primaryOverlap: SocialOverlapEntry | null;
} {
  const lines = buildAttributionLines({
    affinityConnector: input.affinityConnector,
    overlaps: input.overlaps,
  });
  let hopChain = attachAttributionLinesToHopChain(input.hopChain, lines);
  const primaryOverlap = pickPrimarySocialOverlap(input.overlaps);
  const contact = hopChain.contact as { name?: string; linkedin?: string } | undefined;
  const plLinkedIn = primaryOverlap ? plPersonLinkedInFromOverlap(primaryOverlap) : undefined;
  if (
    contact &&
    plLinkedIn &&
    !contact.linkedin &&
    contact.name &&
    normName(contact.name) === normName(primaryOverlap!.plName)
  ) {
    hopChain = { ...hopChain, contact: { ...contact, linkedin: plLinkedIn } };
  }
  return {
    hopChain,
    score: applyLinkedInPathWarmth(input.pathScore, input.overlaps),
    primaryOverlap,
  };
}
