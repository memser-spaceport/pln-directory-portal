/**
 * Resolve founder contacts on F-paths to LabOS members (task 10).
 * Pure matching — indexes are built once at seed time from Prisma.
 */
import { PrismaClient } from '@prisma/client';
import { firmKey } from './firm-key.util';

export const normalizePersonName = (name: string | null | undefined): string =>
  (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function parseBridgeTeamName(evidence: string | null | undefined): string | null {
  if (!evidence) return null;
  const m = /co-invested via (.+)/i.exec(evidence);
  return m?.[1]?.trim() ?? null;
}

export function parseBridgeFromHopChain(hopChain: {
  edges?: Array<{ evidence?: string | null }>;
  connectorTeam?: { name?: string };
}): string | null {
  if (hopChain.connectorTeam?.name) return hopChain.connectorTeam.name;
  const edges = hopChain.edges ?? [];
  if (edges.length === 0) return null;
  return parseBridgeTeamName(edges[edges.length - 1]?.evidence ?? null);
}

export interface TeamLink {
  name: string;
  teamUid?: string;
  logo?: string;
}

export interface FounderContact {
  name: string;
  role: string;
  memberUid?: string;
  teams?: TeamLink[];
}

export interface ConnectorTeamBlock {
  name: string;
  teamUid?: string;
  leads: FounderContact[];
}

export interface RouteNodeLike {
  label: string;
  memberUid?: string;
  teamUid?: string;
  logo?: string;
  variant: 'member' | 'external' | 'org';
}

export interface PortfolioTeamEntry {
  teamUid: string;
  teamName: string;
  logoUrl?: string;
  founders: Array<{ name: string; memberUid: string }>;
}

/** norm(teamName) and firmKey(teamName) → portfolio team with LabOS founders. */
export type PortfolioTeamIndex = Map<string, PortfolioTeamEntry>;

/** normalizePersonName → member uid (only unambiguous names). */
export type MemberNameIndex = Map<string, string>;

export interface FounderResolveIndexes {
  portfolioTeams: PortfolioTeamIndex;
  membersByName: MemberNameIndex;
}

function lookupPortfolioTeam(bridgeName: string | null, index: PortfolioTeamIndex): PortfolioTeamEntry | undefined {
  if (!bridgeName) return undefined;
  const keys = [normalizePersonName(bridgeName), firmKey(bridgeName)].filter(Boolean);
  for (const k of keys) {
    const hit = index.get(k);
    if (hit) return hit;
  }
  return undefined;
}

function findFounderOnTeam(personName: string, team: PortfolioTeamEntry): { memberUid: string } | undefined {
  const key = normalizePersonName(personName);
  if (!key) return undefined;
  return team.founders.find((f) => normalizePersonName(f.name) === key);
}

function teamLinksFor(entry: PortfolioTeamEntry): TeamLink[] {
  return [{ name: entry.teamName, teamUid: entry.teamUid, logo: entry.logoUrl }];
}

function resolveContactUid(
  contact: FounderContact,
  bridgeName: string | null,
  indexes: FounderResolveIndexes
): FounderContact {
  if (contact.memberUid) return contact;

  const team = lookupPortfolioTeam(bridgeName, indexes.portfolioTeams);
  if (team) {
    const onTeam = findFounderOnTeam(contact.name, team);
    if (onTeam) {
      return {
        ...contact,
        memberUid: onTeam.memberUid,
        teams: teamLinksFor(team),
      };
    }
  }

  const byName = indexes.membersByName.get(normalizePersonName(contact.name));
  if (byName) {
    return { ...contact, memberUid: byName };
  }

  return contact;
}

export interface HopChainForFounderResolve {
  contact?: FounderContact;
  orgConnector?: unknown;
  connectorTeam?: ConnectorTeamBlock;
  routeNodes?: RouteNodeLike[];
  edges?: Array<{ evidence?: string | null }>;
}

/** Enrich contact / connectorTeam.leads with memberUid; refresh connector routeNodes. */
export function enrichFounderContacts<T extends HopChainForFounderResolve>(
  hopChain: T,
  indexes: FounderResolveIndexes
): T {
  const bridgeName = parseBridgeFromHopChain(hopChain);
  let contact = hopChain.contact ? resolveContactUid(hopChain.contact, bridgeName, indexes) : undefined;

  let connectorTeam = hopChain.connectorTeam;
  if (connectorTeam?.leads?.length) {
    const team = lookupPortfolioTeam(bridgeName ?? connectorTeam.name, indexes.portfolioTeams);
    const leads = connectorTeam.leads.map((lead) => resolveContactUid(lead, bridgeName, indexes));
    connectorTeam = {
      ...connectorTeam,
      ...(team ? { teamUid: team.teamUid } : {}),
      leads,
    };
    if (!contact && leads[0]) contact = leads[0];
  }

  return {
    ...hopChain,
    ...(contact ? { contact } : {}),
    ...(connectorTeam ? { connectorTeam } : {}),
  };
}

/** Build portfolio team index from Directory teams with PL cap-table overlap. */
export async function loadPortfolioFounderIndex(prisma: PrismaClient): Promise<PortfolioTeamIndex> {
  const index: PortfolioTeamIndex = new Map();
  const teams = await prisma.team.findMany({
    where: { portfolioOverlaps: { some: {} } },
    select: {
      uid: true,
      name: true,
      logo: { select: { url: true } },
      teamMemberRoles: {
        include: { member: { select: { uid: true, name: true } } },
      },
    },
  });

  for (const team of teams) {
    const founders = team.teamMemberRoles.map((r) => ({
      name: r.member.name,
      memberUid: r.member.uid,
    }));
    if (founders.length === 0) continue;

    const entry: PortfolioTeamEntry = {
      teamUid: team.uid,
      teamName: team.name,
      logoUrl: team.logo?.url ?? undefined,
      founders,
    };

    const normKey = normalizePersonName(team.name);
    const fk = firmKey(team.name);
    if (normKey && !index.has(normKey)) index.set(normKey, entry);
    if (fk && !index.has(fk)) index.set(fk, entry);
  }

  return index;
}

/** Approved members with unique normalized full names only. */
export async function loadMemberNameIndex(prisma: PrismaClient): Promise<MemberNameIndex> {
  const members = await prisma.member.findMany({
    where: { memberApproval: { state: 'APPROVED' } },
    select: { uid: true, name: true },
  });

  const counts = new Map<string, number>();
  for (const m of members) {
    const k = normalizePersonName(m.name);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const index: MemberNameIndex = new Map();
  for (const m of members) {
    const k = normalizePersonName(m.name);
    if (!k || (counts.get(k) ?? 0) > 1) continue;
    index.set(k, m.uid);
  }

  return index;
}
