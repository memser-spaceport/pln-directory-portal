/**
 * Social overlap cache consumer for pathfinder neuro/gold seed.
 * Reads `_social_overlap_cache.json` produced by pln-data-enrichment compute-social-overlaps.
 * Logic mirrors enrichment path-pl-people-resolve + social-overlap (no cross-repo imports).
 */

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

/** Conservative multiplicative bump when overlap.affectsScore is true. */
export const SOCIAL_OVERLAP_SCORE_MULTIPLIER = 1.05;
export const SOCIAL_OVERLAP_SCORE_CAP = 1.0;

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
  partial: Omit<PlPathPerson, 'personKey'> & { identity?: PersonIdentity },
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
export function resolveTargetInvestorPersonKeys(
  hopChain: PathHopChain,
  targetInvestorId: string,
): Set<string> {
  const keys = new Set<string>();

  if (/^\d+$/.test(targetInvestorId)) {
    keys.add(`investor:${targetInvestorId}`);
  }

  for (const contact of collectTargetSideContacts(hopChain)) {
    const identity = identityFromContact(
      contact,
      asString(contact.role) ?? hopChain.connectorTeam?.name ?? null,
    );
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

function extractFounderNodes(
  hopChain: PathHopChain,
  resolveMemberUidByName?: (name: string) => string | undefined,
): PlPathPerson[] {
  const founderIds = founderNodeIds(hopChain);
  if (founderIds.size === 0) return [];

  const byId = new Map((hopChain.nodes ?? []).map((node) => [node.id, node]));
  const people: PlPathPerson[] = [];

  for (const id of founderIds) {
    const node = byId.get(id);
    const name = asString(node?.label) ?? id.replace(/^f_/, '').replace(/_/g, ' ');
    const memberUid = resolveMemberUidByName?.(name);
    const identity: PersonIdentity = { name, memberUid };
    people.push({
      personKey: resolvePersonKey(identity),
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
  source: string,
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
  options: { resolveMemberUidByName?: (name: string) => string | undefined } = {},
): PlPathPerson[] {
  const out = new Map<string, PlPathPerson>();

  for (const founder of extractFounderNodes(hopChain, options.resolveMemberUidByName)) {
    addPerson(out, founder);
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

export function buildSocialOverlapCacheKey(input: {
  investorId: string;
  plPersonKey: string;
}): string {
  return `pair:investor:${input.investorId}|pl:${input.plPersonKey}`;
}

/** Map hopChain.plConnector to the same personKey used in the overlap cache. */
export function resolvePlConnectorPersonKey(
  pl: HopChainPlConnector,
  resolveMemberUidByName?: (name: string) => string | undefined,
): string | null {
  const name = asString(pl.name);
  const memberUid =
    asString(pl.memberUid) ?? (name ? resolveMemberUidByName?.(name) : undefined);
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
 * Lookup overlap for an investor × PL connector pair after hopChain.plConnector is grafted.
 */
export function lookupSocialOverlapForPair(
  cache: SocialOverlapCache,
  input: {
    investorId: string;
    plConnector: HopChainPlConnector;
    resolveMemberUidByName?: (name: string) => string | undefined;
  },
): SocialOverlapEntry | null {
  const plPersonKey = resolvePlConnectorPersonKey(
    input.plConnector,
    input.resolveMemberUidByName,
  );
  if (!plPersonKey) return null;

  const key = buildSocialOverlapCacheKey({
    investorId: input.investorId,
    plPersonKey,
  });
  return cache[key] ?? null;
}

export function appendOverlapToHopChain(
  hopChain: Record<string, unknown>,
  overlap: SocialOverlapEntry,
): Record<string, unknown> {
  const hc: Record<string, unknown> = { ...hopChain };
  const existing = typeof hc.explanation === 'string' ? hc.explanation : '';
  if (existing.includes(overlap.label)) return hc;
  hc.explanation = existing ? `${existing} ${overlap.label}.` : `${overlap.label}.`;
  return hc;
}

export function applySocialOverlapScoreBump(
  score: number,
  overlap: SocialOverlapEntry | null,
): number {
  if (!overlap?.affectsScore) return score;
  return Math.min(SOCIAL_OVERLAP_SCORE_CAP, score * SOCIAL_OVERLAP_SCORE_MULTIPLIER);
}
