/**
 * Must match pln-data-enrichment/.../pathfinder/pl-team-relationship.util.ts
 */

/**
 * PL Path Finder — map Affinity per-internal-user signals to the "best PL team
 * connector" for one LP. Pure: no I/O (the live pull lives in
 * scripts/pull-affinity-pl-relationships.ts; this module is the tested seam —
 * exactly the role gold-relationship.util.ts / affinity-contact.util.ts play).
 *
 * ## Why this exists
 *
 * The relationship axis needs to name *which venture lead* (Marc, Brad, Lacey,
 * Charlotte, Christina, Juan, …) can connect to each LP. That attribution is NOT
 * on the LP record (the v2 list only carries AGGREGATE interaction dates). It
 * lives in two Affinity v1 endpoints, both keyed by the LP's person id:
 *
 *   - GET /relationships-strengths?external_id={lpId}
 *       -> [{ internal_id, external_id, strength 0..1 }]   (the RANKING signal:
 *          Affinity's computed 1:1 tie strength per internal user)
 *   - GET /persons/{lpId}?with_interaction_dates=true&with_interaction_persons=true
 *       -> interactions.{first_email,last_email,last_event,…} each { date,
 *          person_ids[] }                                   (recency + evidence)
 *
 * ## Findings the ranking logic is built around (60-LP discovery sample)
 *
 *   - `strength` is the trustworthy signal: present for ~70% of connector rows.
 *   - Shared calendar EVENTS are a false-positive trap: a single group event
 *     (e.g. a demo day) lists the same identical date under `*_event.person_ids`
 *     for several leads who were merely co-invited — that is NOT a 1:1 tie. So:
 *       * a numeric `strength` always ranks above a strength-less tie;
 *       * an email tie (1:1) ranks above an event-only tie;
 *       * an event-only tie is flagged `eventOnly` (low confidence) and never
 *         claims a strength it doesn't have.
 *
 * No imputation: an absent signal contributes nothing and lowers the tier.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Venture leads — keep in sync with scripts/pull-affinity-pl-relationships.ts DEFAULT_LEADS. */
export const DEFAULT_PL_TEAM_LEADS: PlTeamMember[] = [
  { name: 'Marc Johnson', internalId: 253405047 },
  { name: 'Brad Holden', internalId: 118269819 },
  { name: 'Lacey Wisdom', internalId: 118239754 },
  { name: 'Charlotte Kapoor', internalId: 244408594 },
  { name: 'Christina DesVaux', internalId: 228136266 },
  { name: 'Juan Benet', internalId: 254145996 },
];

export type PlConnectorAttributionSource = 'affinity-v1' | 'keyContact' | 'lastContact' | 'lastEmail';

/** Roster list-export hints for connector fallback (from affinity-roster-mapper). */
export interface RosterConnectorHints {
  keyContactName?: string;
  lastContactFromName?: string;
  lastContactFromInternal?: boolean;
  lastContactDate?: string;
  lastEmailFromName?: string;
  lastEmailFromInternal?: boolean;
  lastEmailDate?: string;
}

/** One internal team member we attribute connectors to (the venture leads). */
export interface PlTeamMember {
  name: string;
  /** Affinity internal person id. */
  internalId: number;
}

/** A single relationship-strengths row from Affinity v1 (snake_case as returned). */
export interface RelationshipStrength {
  internal_id: number;
  external_id: number;
  strength: number;
}

/** One interaction slot from `persons/{id}.interactions` (date + internal participants). */
export interface InteractionSlot {
  date: string | null;
  person_ids: number[];
}

/** The `interactions` object: kind (e.g. `last_email`) -> slot | null. */
export type Interactions = Record<string, InteractionSlot | null>;

/**
 * Confidence tier for a connector tie. Higher = more trustworthy. A plain const
 * object (not a TS `enum`) so the module is friendly to type-only transpilers.
 */
export const ConnectorTier = {
  /** Attribution only via shared calendar events — low confidence. */
  EventOnly: 0,
  /** A 1:1 email tie but no computed strength. */
  Email: 1,
  /** Affinity computed a relationship strength — the strongest signal. */
  Strength: 2,
} as const;
export type ConnectorTier = typeof ConnectorTier[keyof typeof ConnectorTier];

/** A resolved connector: one PL team member's tie to one LP. */
export interface PlConnector {
  name: string;
  internalId: number;
  /** Affinity relationship strength 0..1, or null when not computed. */
  strength: number | null;
  /** Days since the most recent ATTRIBUTED, non-future interaction; null if none. */
  recencyDays: number | null;
  /** Interaction kind backing `recencyDays` (e.g. `last_email`), or null. */
  evidenceKind: string | null;
  /** ISO date backing `recencyDays`, or null. */
  evidenceDate: string | null;
  /** True when the only attribution is shared events (no strength, no email). */
  eventOnly: boolean;
  tier: ConnectorTier;
  attributionSource?: PlConnectorAttributionSource;
}

/** Per-LP result: connectors strongest-first, the best one, and card copy. */
export interface PlTeamRelationship {
  externalId: number | null;
  /** Sorted strongest-first (tier, then strength, then recency). */
  connectors: PlConnector[];
  bestConnector: PlConnector | null;
  /** One-sentence copy for the warm-path card, or null when no connector. */
  summary: string | null;
}

/** Interaction kinds that represent a 1:1 email tie (trustworthy attribution). */
const EMAIL_KINDS = new Set(['first_email', 'last_email']);
/** Calendar-event kinds — often GROUP events, so treated as low-confidence. */
const EVENT_KINDS = new Set(['first_event', 'last_event', 'next_event']);
/** Other interaction kinds carrying attribution (chat). Aggregate `last_interaction` excluded. */
const OTHER_KINDS = new Set(['last_chat_message']);

const ROSTER_ATTRIBUTION_SOURCES = new Set<PlConnectorAttributionSource>(['keyContact', 'lastContact', 'lastEmail']);

export const AFFINITY_DIRECT_STRENGTH_THRESHOLD = 0.3;

export const normalizePersonName = (name: string | null | undefined): string =>
  (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function findLeadByName(name: string, leads: PlTeamMember[]): PlTeamMember | undefined {
  const key = normalizePersonName(name);
  if (!key) return undefined;
  return leads.find((l) => normalizePersonName(l.name) === key);
}

/**
 * True when a connector is strong enough for a synthetic PL+1 direct path.
 * Email-tier / one-way ties alone do not qualify (LAB-2108).
 */
export function passesPlConnectorThreshold(connector: PlConnector): boolean {
  if (connector.attributionSource && ROSTER_ATTRIBUTION_SOURCES.has(connector.attributionSource)) {
    return true;
  }
  if (connector.strength != null && connector.strength >= AFFINITY_DIRECT_STRENGTH_THRESHOLD) {
    return true;
  }
  return false;
}

function tagV1Connectors(rel: PlTeamRelationship): PlTeamRelationship {
  const tag = (c: PlConnector): PlConnector => (c.attributionSource ? c : { ...c, attributionSource: 'affinity-v1' });
  return {
    ...rel,
    connectors: rel.connectors.map(tag),
    bestConnector: rel.bestConnector ? tag(rel.bestConnector) : null,
  };
}

function parseRecencyDays(date: string | null, refMs: number): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (!Number.isFinite(t) || t > refMs) return null; // ignore future (e.g. next_event)
  return Math.max(0, Math.round((refMs - t) / DAY_MS));
}

/**
 * Resolve, for ONE LP, the per-team-member connectors from the LP's relationship
 * strengths + interactions. `leads` is the closed set of internal users we care
 * about (the venture leads). `referenceIso` is the run date (kept as a parameter
 * so the function stays pure / deterministic). Returns connectors sorted
 * strongest-first with a ready-to-render one-line summary.
 */
export function resolvePlConnectors(
  strengths: RelationshipStrength[],
  interactions: Interactions,
  leads: PlTeamMember[],
  referenceIso: string
): PlTeamRelationship {
  const refMs = new Date(referenceIso).getTime();
  const externalId = strengths.find((s) => Number.isFinite(s.external_id))?.external_id ?? null;
  const strengthById = new Map<number, number>();
  for (const s of strengths) {
    if (typeof s.strength === 'number' && Number.isFinite(s.strength)) {
      strengthById.set(s.internal_id, s.strength);
    }
  }

  const connectors: PlConnector[] = [];
  for (const lead of leads) {
    const strength = strengthById.has(lead.internalId) ? (strengthById.get(lead.internalId) as number) : null;

    // Scan the lead's attributed interactions; track best (most recent) email and
    // event/other separately so an email tie can outrank an event-only one.
    let bestEmail: { days: number; kind: string; date: string } | null = null;
    let bestOther: { days: number; kind: string; date: string } | null = null;
    for (const [kind, slot] of Object.entries(interactions)) {
      if (!slot || !Array.isArray(slot.person_ids)) continue;
      if (!slot.person_ids.includes(lead.internalId)) continue;
      const days = parseRecencyDays(slot.date, refMs);
      if (days === null || !slot.date) continue;
      const candidate = { days, kind, date: slot.date };
      const bucket = EMAIL_KINDS.has(kind) ? 'email' : EVENT_KINDS.has(kind) || OTHER_KINDS.has(kind) ? 'other' : null;
      if (bucket === 'email' && (!bestEmail || days < bestEmail.days)) bestEmail = candidate;
      else if (bucket === 'other' && (!bestOther || days < bestOther.days)) bestOther = candidate;
    }

    const hasEmail = bestEmail !== null;
    const hasOther = bestOther !== null;
    if (strength === null && !hasEmail && !hasOther) continue; // no tie at all — skip

    // Evidence = most recent attributed interaction, preferring an email tie.
    const evidence = bestEmail ?? bestOther;
    const tier = strength !== null ? ConnectorTier.Strength : hasEmail ? ConnectorTier.Email : ConnectorTier.EventOnly;

    connectors.push({
      name: lead.name,
      internalId: lead.internalId,
      strength,
      recencyDays: evidence?.days ?? null,
      evidenceKind: evidence?.kind ?? null,
      evidenceDate: evidence?.date ?? null,
      eventOnly: tier === ConnectorTier.EventOnly,
      tier,
      attributionSource: 'affinity-v1',
    });
  }

  // Sort strongest-first: tier, then strength (null -> -1), then most recent.
  connectors.sort((a, b) => {
    if (a.tier !== b.tier) return b.tier - a.tier;
    const sa = a.strength ?? -1;
    const sb = b.strength ?? -1;
    if (sa !== sb) return sb - sa;
    const ra = a.recencyDays ?? Number.POSITIVE_INFINITY;
    const rb = b.recencyDays ?? Number.POSITIVE_INFINITY;
    return ra - rb;
  });

  const bestConnector = connectors[0] ?? null;
  return {
    externalId,
    connectors,
    bestConnector,
    summary: summarize(bestConnector),
  };
}

/** Resolve a PL connector from roster list fields when v1 attribution is insufficient. */
export function resolveRosterFallbackConnector(
  hints: RosterConnectorHints,
  leads: PlTeamMember[],
  referenceIso: string
): PlConnector | null {
  const refMs = new Date(referenceIso).getTime();

  if (hints.keyContactName) {
    const lead = findLeadByName(hints.keyContactName, leads);
    if (lead) {
      return {
        name: lead.name,
        internalId: lead.internalId,
        strength: null,
        recencyDays: null,
        evidenceKind: null,
        evidenceDate: null,
        eventOnly: false,
        tier: ConnectorTier.Email,
        attributionSource: 'keyContact',
      };
    }
  }

  const touchCandidates: Array<{
    source: 'lastContact' | 'lastEmail';
    name?: string;
    isInternal?: boolean;
    date?: string;
    kind: string;
  }> = [
    {
      source: 'lastContact',
      name: hints.lastContactFromName,
      isInternal: hints.lastContactFromInternal,
      date: hints.lastContactDate,
      kind: 'last-contact',
    },
    {
      source: 'lastEmail',
      name: hints.lastEmailFromName,
      isInternal: hints.lastEmailFromInternal,
      date: hints.lastEmailDate,
      kind: 'last-email',
    },
  ];

  for (const touch of touchCandidates) {
    if (!touch.name || !touch.isInternal) continue;
    const lead = findLeadByName(touch.name, leads);
    if (!lead) continue;
    const recencyDays = touch.date ? parseRecencyDays(touch.date, refMs) : null;
    return {
      name: lead.name,
      internalId: lead.internalId,
      strength: null,
      recencyDays,
      evidenceKind: touch.kind,
      evidenceDate: touch.date ?? null,
      eventOnly: false,
      tier: ConnectorTier.Email,
      attributionSource: touch.source,
    };
  }

  return null;
}

/**
 * Prefer v1 bestConnector when it passes threshold; otherwise roster fallback.
 * v1 never overridden when passing.
 */
export function mergePlTeamRelationship(
  v1: PlTeamRelationship,
  hints: RosterConnectorHints,
  leads: PlTeamMember[],
  referenceIso: string
): PlTeamRelationship {
  const tagged = tagV1Connectors(v1);
  if (tagged.bestConnector && passesPlConnectorThreshold(tagged.bestConnector)) {
    return tagged;
  }

  const fallback = resolveRosterFallbackConnector(hints, leads, referenceIso);
  if (!fallback) return tagged;

  const connectors = [
    fallback,
    ...tagged.connectors.filter((c) => normalizePersonName(c.name) !== normalizePersonName(fallback.name)),
  ];
  return {
    ...tagged,
    connectors,
    bestConnector: fallback,
    summary: summarize(fallback),
  };
}

/** Humanize a day count into card-friendly relative text. Deterministic. */
export function humanizeRecency(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 1) return 'today';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `~${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `~${Math.round(days / 30)} months ago`;
  return `~${Math.round(days / 365)} years ago`;
}

/** One-sentence warm-path copy for the best connector, or null. */
export function summarize(best: PlConnector | null): string | null {
  if (!best) return null;
  if (best.attributionSource === 'keyContact') {
    return `Best connector: ${best.name} (CRM relationship owner)`;
  }
  if (best.attributionSource === 'lastContact' || best.attributionSource === 'lastEmail') {
    const rec = humanizeRecency(best.recencyDays);
    const verb = best.attributionSource === 'lastEmail' ? 'last email' : 'last contact';
    return rec ? `Best connector: ${best.name} (${verb} ${rec})` : `Best connector: ${best.name} (${verb})`;
  }
  const parts: string[] = [];
  if (best.strength !== null) parts.push(`tie ${best.strength.toFixed(2)}`);
  const rec = humanizeRecency(best.recencyDays);
  if (rec) {
    const verb = best.evidenceKind && EMAIL_KINDS.has(best.evidenceKind) ? 'last email' : 'last touch';
    parts.push(`${verb} ${rec}`);
  }
  const detail = parts.length ? ` (${parts.join(', ')})` : '';
  const caveat = best.eventOnly ? ' — shared event only' : '';
  return `Best connector: ${best.name}${detail}${caveat}`;
}
