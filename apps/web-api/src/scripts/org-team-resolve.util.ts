/**
 * Resolve org-bridge firms to Directory teams (L1+) at pathfinder seed time.
 */
import { PrismaClient } from '@prisma/client';
import {
  buildTeamMatchIndex,
  matchTeam,
  normalizeCompanyMatchName,
  normalizeDomain,
  type TeamMatchIndex,
} from '../affinity/affinity-match.util';
import { firmKey } from './firm-key.util';
import type { OrgConnectorLike, RouteNodeLike } from './org-contact-resolve.util';

export interface DirectoryTeamEntry {
  teamUid: string;
  logoUrl?: string;
}

export interface DirectoryTeamIndex {
  match: TeamMatchIndex;
  byFirmKey: Map<string, string>;
  byUid: Map<string, DirectoryTeamEntry>;
}

export interface OrgTeamLookupInput {
  name: string;
  website?: string | null;
  email?: string | null;
}

function emailDomain(email: string | null | undefined): string | null {
  const e = (email ?? '').trim().toLowerCase();
  if (!e.includes('@')) return null;
  const domain = e.split('@')[1]?.trim();
  return domain || null;
}

/** L1+ Directory teams indexed for org-connector crosswalk. */
export async function loadDirectoryTeamIndex(prisma: PrismaClient): Promise<DirectoryTeamIndex> {
  const teams = await prisma.team.findMany({
    where: {
      accessLevel: { notIn: ['L0', 'Rejected'] },
    },
    select: {
      uid: true,
      name: true,
      website: true,
      airtableRecId: true,
      logo: { select: { url: true } },
    },
  });

  const byUid = new Map<string, DirectoryTeamEntry>();
  const byFirmKey = new Map<string, string>();
  for (const team of teams) {
    byUid.set(team.uid, { teamUid: team.uid, logoUrl: team.logo?.url ?? undefined });
    const fk = firmKey(team.name);
    if (fk && !byFirmKey.has(fk)) byFirmKey.set(fk, team.uid);
    const norm = normalizeCompanyMatchName(team.name);
    if (norm && !byFirmKey.has(norm)) byFirmKey.set(norm, team.uid);
  }

  return {
    match: buildTeamMatchIndex(teams),
    byFirmKey,
    byUid,
  };
}

export function lookupTeamForOrg(input: OrgTeamLookupInput, index: DirectoryTeamIndex): DirectoryTeamEntry | null {
  const domains = [normalizeDomain(input.website), emailDomain(input.email)].filter((d): d is string => Boolean(d));

  const affinityMatch = matchTeam(
    {
      name: input.name,
      domain: domains[0] ?? null,
      domains: domains.slice(1),
      affinityOrgId: '',
    },
    index.match
  );
  if (affinityMatch) {
    return index.byUid.get(affinityMatch.uid) ?? { teamUid: affinityMatch.uid };
  }

  const fk = firmKey(input.name);
  if (fk) {
    const uid = index.byFirmKey.get(fk);
    if (uid) return index.byUid.get(uid) ?? { teamUid: uid };
  }

  const norm = normalizeCompanyMatchName(input.name);
  if (norm) {
    const uid = index.byFirmKey.get(norm);
    if (uid) return index.byUid.get(uid) ?? { teamUid: uid };
  }

  return null;
}

function orgLookupFromConnector(org: OrgConnectorLike): OrgTeamLookupInput {
  const contactEmail = org.contacts?.find((c) => c.email)?.email;
  return {
    name: org.name,
    website: org.website ?? org.email?.split('@')[1],
    email: org.email ?? contactEmail,
  };
}

function enrichOrgConnector(org: OrgConnectorLike, index: DirectoryTeamIndex): OrgConnectorLike {
  if (org.teamUid) return org;
  const hit = lookupTeamForOrg(orgLookupFromConnector(org), index);
  if (!hit) return org;
  return {
    ...org,
    teamUid: hit.teamUid,
    logo: org.logo ?? hit.logoUrl,
  };
}

function orgNameMatches(a: string | undefined, orgName: string): boolean {
  if (!a?.trim()) return false;
  const keyA = firmKey(a);
  const keyB = firmKey(orgName);
  return keyA === keyB || normalizeCompanyMatchName(a) === normalizeCompanyMatchName(orgName);
}

function enrichRouteNodeForOrg(node: RouteNodeLike, org: OrgConnectorLike): RouteNodeLike {
  if (node.teamUid) return node;
  if (!org.teamUid) return node;
  const matches =
    node.variant === 'org'
      ? orgNameMatches(node.label, org.name)
      : orgNameMatches(node.orgName, org.name) || orgNameMatches(node.label, org.name);
  if (!matches) return node;
  return {
    ...node,
    teamUid: org.teamUid,
    logo: node.logo ?? org.logo,
  };
}

export interface HopChainForOrgTeamResolve {
  orgConnector?: OrgConnectorLike;
  orgConnectors?: OrgConnectorLike[];
  routeNodes?: RouteNodeLike[];
}

/** Apply org teamUid/logo onto final route nodes when orgName or label matches. */
export function applyOrgTeamToRouteNodes(
  routeNodes: RouteNodeLike[],
  orgConnectors: OrgConnectorLike[]
): RouteNodeLike[] {
  return routeNodes.map((node) => {
    for (const org of orgConnectors) {
      if (!org.teamUid) continue;
      const updated = enrichRouteNodeForOrg(node, org);
      if (updated.teamUid) return updated;
    }
    return node;
  });
}

/** Attach Directory teamUid + logo to org connectors and matching route nodes. */
export function enrichOrgConnectorTeams<T extends HopChainForOrgTeamResolve>(
  hopChain: T,
  index: DirectoryTeamIndex
): T {
  const orgConnectors = (hopChain.orgConnectors ?? (hopChain.orgConnector ? [hopChain.orgConnector] : [])).map((org) =>
    enrichOrgConnector(org, index)
  );
  if (orgConnectors.length === 0) return hopChain;

  const primary = orgConnectors[0];
  const routeNodes = hopChain.routeNodes?.map((node) => enrichRouteNodeForOrg(node, primary));

  return {
    ...hopChain,
    orgConnectors,
    orgConnector: primary,
    ...(routeNodes ? { routeNodes } : {}),
  };
}
