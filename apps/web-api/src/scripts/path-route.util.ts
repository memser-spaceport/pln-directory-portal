/**
 * People-first route helpers for the neuro seed script (mirrors data-enrichment
 * path-route.util.ts — keep in sync for investor terminus + legacy fallback).
 */

import {
  enrichFounderContacts,
  normalizePersonName,
  parseBridgeFromHopChain,
  type FounderResolveIndexes,
} from './founder-member-resolve.util';
import {
  enrichOrgConnectorContacts,
  hydratePersonRouteNodes,
  type MemberContactIndex,
  type RouteNodeContact,
} from './org-contact-resolve.util';
import { enrichOrgConnectorTeams, applyOrgTeamToRouteNodes, type DirectoryTeamIndex } from './org-team-resolve.util';

export type RouteNodeVariant = 'member' | 'external' | 'org';

export interface RouteNode {
  label: string;
  orgName?: string;
  role?: string;
  email?: string;
  linkedin?: string;
  telegram?: string;
  imageUrl?: string;
  memberUid?: string;
  teamUid?: string;
  logo?: string;
  variant: RouteNodeVariant;
  contacts?: RouteNodeContact[];
}

export interface PlConnectorInput {
  name: string;
  internalId?: number;
  strength?: number | null;
  recencyDays?: number | null;
  evidenceKind?: string | null;
  evidenceDate?: string | null;
  eventOnly?: boolean;
  tier?: number;
}

export const PROTOCOL_LABS_ORG_NODE: RouteNode = {
  label: 'Protocol Labs',
  variant: 'org',
};

export function plConnectorToRouteNode(connector: PlConnectorInput, memberUid?: string): RouteNode {
  return {
    label: connector.name,
    memberUid,
    variant: memberUid ? 'member' : 'external',
  };
}

function stripPlConnectorFromBridge(bridge: RouteNode[], connectorName?: string | null): RouteNode[] {
  if (!connectorName?.trim()) return bridge;
  const key = normalizePersonName(connectorName);
  return bridge.filter((n) => normalizePersonName(n.label) !== key);
}

function connectorMatchesPlContact(contactName: string, plConnector?: PlConnectorInput | null): boolean {
  if (!plConnector?.name) return false;
  return normalizePersonName(contactName) === normalizePersonName(plConnector.name);
}

function stripLeadingPlOrg(nodes: RouteNode[]): RouteNode[] {
  if (nodes.length > 0 && nodes[0].label === PROTOCOL_LABS_ORG_NODE.label && nodes[0].variant === 'org') {
    return nodes.slice(1);
  }
  return nodes;
}

export function buildFullRouteNodes(input: {
  bridgeNodes: RouteNode[];
  plConnector?: PlConnectorInput | null;
  plConnectorMemberUid?: string;
  investorNode?: RouteNode;
  hops?: number;
}): RouteNode[] {
  const bridge = stripPlaceholderInvestor(
    stripPlConnectorFromBridge(stripLeadingPlOrg(input.bridgeNodes), input.plConnector?.name)
  );
  const prefix: RouteNode[] = input.plConnector
    ? [plConnectorToRouteNode(input.plConnector, input.plConnectorMemberUid)]
    : bridge.length > 0 && (input.hops === undefined || input.hops >= 2)
    ? [PROTOCOL_LABS_ORG_NODE]
    : [];

  const core = [...prefix, ...bridge];
  return input.investorNode ? [...core, input.investorNode] : core;
}

interface LegacyHopChainNode {
  id?: string;
  label?: string;
  type?: 'person' | 'org';
}

interface LegacyHopChain {
  nodes?: LegacyHopChainNode[];
  routeNodes?: RouteNode[];
  plConnector?: PlConnectorInput;
  contact?: {
    name: string;
    role: string;
    memberUid?: string;
    email?: string;
    linkedin?: string;
    teams?: Array<{ name: string; teamUid?: string; logo?: string }>;
  };
  orgConnector?: {
    name: string;
    description: string;
    tags: string[];
    teamUid?: string;
    logo?: string;
    contacts?: RouteNodeContact[];
  };
  orgConnectors?: Array<{
    name: string;
    description: string;
    tags: string[];
    teamUid?: string;
    logo?: string;
    contacts?: RouteNodeContact[];
  }>;
  connectorTeam?: { name: string; leads: Array<{ name: string; role: string }> };
  edges?: Array<{ evidence?: string | null; connectorType?: string }>;
  explanation?: string;
}

const PL_IDS = new Set(['pl']);
const PL_LABELS = new Set(['protocol labs']);

function isPlNode(node: LegacyHopChainNode): boolean {
  const id = (node.id ?? '').toLowerCase();
  const label = (node.label ?? '').toLowerCase();
  return PL_IDS.has(id) || PL_LABELS.has(label);
}

function isPersonNode(node: LegacyHopChainNode): boolean {
  const id = node.id ?? '';
  return node.type === 'person' || id.startsWith('f_');
}

function isPlaceholderInvestorNode(node: LegacyHopChainNode): boolean {
  return (node.label ?? '').toLowerCase() === 'investor' && isPersonNode(node);
}

function stripPlaceholderInvestor(nodes: RouteNode[]): RouteNode[] {
  return nodes.filter((n) => n.label.toLowerCase() !== 'investor');
}

function pickConnectorNode(nodes: LegacyHopChainNode[]): LegacyHopChainNode | null {
  const inner = nodes.filter((n) => !isPlNode(n) && !isPlaceholderInvestorNode(n));
  if (inner.length <= 1) return inner[0] ?? null;
  return inner[0] ?? null;
}

/** Build the investor terminus node (person-grain). */
export function buildInvestorRouteNode(input: { firstName: string; lastName: string; memberUid?: string }): RouteNode {
  const label = `${input.firstName} ${input.lastName}`.trim();
  return {
    label,
    memberUid: input.memberUid,
    variant: input.memberUid ? 'member' : 'external',
  };
}

/** Legacy fallback when dump predates task 06 presentation fields. */
export function deriveConnectorRouteNodesFromLegacy(hopChain: LegacyHopChain): RouteNode[] {
  const nodes = hopChain.nodes ?? [];
  const connectorNode = pickConnectorNode(nodes);
  if (!connectorNode?.label) return [];
  if (isPersonNode(connectorNode)) {
    return [{ label: connectorNode.label, variant: 'external' }];
  }
  return [{ label: connectorNode.label, variant: 'org' }];
}

function lastEvidence(hc: LegacyHopChain): string {
  const edges = hc.edges ?? [];
  if (edges.length === 0) return hc.explanation ?? '';
  return edges[edges.length - 1]?.evidence ?? hc.explanation ?? '';
}

/** Fill contact/orgConnector when dump predates task 06 runner enrichment. */
function enrichLegacyPresentation(hc: LegacyHopChain): LegacyHopChain {
  if (hc.contact || hc.orgConnector) return hc;
  const connectorNode = pickConnectorNode(hc.nodes ?? []);
  if (!connectorNode?.label) return hc;
  if (isPersonNode(connectorNode)) {
    return { ...hc, contact: { name: connectorNode.label, role: 'Founder' } };
  }
  return {
    ...hc,
    orgConnector: {
      name: connectorNode.label,
      description: lastEvidence(hc),
      tags: ['Org connection', 'Person unknown'],
    },
  };
}

function founderBrokerFromNodes(nodes?: LegacyHopChainNode[]): LegacyHopChainNode | null {
  return nodes?.find((n) => (n.id ?? '').startsWith('f_')) ?? null;
}

/** V8 cap-table members on f_* nodes are LP co-investors, not the founder broker. */
function correctFounderContactFromNodes(hc: LegacyHopChain): LegacyHopChain {
  const founderBroker = founderBrokerFromNodes(hc.nodes);
  if (!founderBroker?.label || !hc.contact) return hc;
  if (connectorMatchesPlContact(hc.contact.name, hc.plConnector)) return hc;
  if (normalizePersonName(hc.contact.name) === normalizePersonName(founderBroker.label)) return hc;

  return {
    ...hc,
    contact: {
      name: founderBroker.label,
      role: 'Founder',
    },
  };
}

function bridgeRouteNodes(hc: LegacyHopChain): RouteNode[] {
  const org = hc.orgConnectors?.[0] ?? hc.orgConnector;
  if (hc.contact && !connectorMatchesPlContact(hc.contact.name, hc.plConnector)) {
    const orgName = parseBridgeFromHopChain(hc) ?? hc.orgConnectors?.[0]?.name ?? hc.orgConnector?.name;
    return [
      {
        label: hc.contact.name,
        orgName,
        memberUid: hc.contact.memberUid,
        teamUid: hc.contact.teams?.[0]?.teamUid ?? org?.teamUid,
        logo: hc.contact.teams?.[0]?.logo ?? org?.logo,
        variant: hc.contact.memberUid ? 'member' : 'external',
        contacts: orgName
          ? [
              {
                name: hc.contact.name,
                role: hc.contact.role,
                email: hc.contact.email,
                linkedin: hc.contact.linkedin,
                memberUid: hc.contact.memberUid,
                source: 'portfolio',
              },
            ]
          : [
              {
                name: hc.contact.name,
                role: hc.contact.role,
                email: hc.contact.email,
                linkedin: hc.contact.linkedin,
                memberUid: hc.contact.memberUid,
                source: 'portfolio',
              },
            ],
      },
    ];
  }
  if (hc.routeNodes && hc.routeNodes.length > 0) {
    return stripPlConnectorFromBridge(stripLeadingPlOrg(hc.routeNodes), hc.plConnector?.name);
  }
  if (org) {
    const contacts = org.contacts ?? [];
    if (contacts.length > 0) {
      const primary = contacts[0];
      return [
        {
          label: primary.name,
          orgName: org.name,
          memberUid: primary.memberUid,
          teamUid: org.teamUid,
          logo: org.logo,
          variant: primary.memberUid ? 'member' : 'external',
          contacts,
        },
      ];
    }
    return [{ label: org.name, variant: 'org' }];
  }
  return deriveConnectorRouteNodesFromLegacy(hc);
}

/** Append investor to routeNodes; clone-safe (returns new object). */
export function finalizePersonHopChain(
  hopChain: Record<string, unknown>,
  person: {
    firstName: string;
    lastName: string;
    memberUid?: string;
    email?: string;
    role?: string;
  },
  founderIndexes?: FounderResolveIndexes,
  hops?: number,
  memberContactIndex?: MemberContactIndex,
  teamIndex?: DirectoryTeamIndex
): Record<string, unknown> {
  let enriched = correctFounderContactFromNodes(enrichLegacyPresentation(hopChain as LegacyHopChain));
  if (memberContactIndex) {
    enriched = enrichOrgConnectorContacts(enriched, memberContactIndex);
  }
  if (founderIndexes) {
    enriched = enrichFounderContacts(enriched, founderIndexes);
  }
  if (teamIndex) {
    enriched = enrichOrgConnectorTeams(enriched, teamIndex);
  }
  const plConnector = enriched.plConnector ?? null;
  const plConnectorMemberUid =
    plConnector && founderIndexes ? founderIndexes.membersByName.get(normalizePersonName(plConnector.name)) : undefined;
  const bridgeNodes = bridgeRouteNodes(enriched);
  const investorNode = buildInvestorRouteNode(person);
  let routeNodes = buildFullRouteNodes({
    bridgeNodes,
    plConnector,
    plConnectorMemberUid,
    investorNode,
    hops,
  });
  if (memberContactIndex) {
    routeNodes = hydratePersonRouteNodes(
      routeNodes,
      {
        investor: person,
        bridgeContact: enriched.contact
          ? {
              name: enriched.contact.name,
              role: enriched.contact.role,
              memberUid: enriched.contact.memberUid,
              email: enriched.contact.email,
              linkedin: enriched.contact.linkedin,
              teams: enriched.contact.teams,
            }
          : undefined,
        plConnector: plConnector ?? undefined,
        plConnectorMemberUid,
      },
      memberContactIndex
    ) as RouteNode[];
  }
  const orgConnectors = enriched.orgConnectors ?? (enriched.orgConnector ? [enriched.orgConnector] : undefined);
  if (orgConnectors?.length) {
    routeNodes = applyOrgTeamToRouteNodes(routeNodes, orgConnectors) as RouteNode[];
  }
  return {
    ...hopChain,
    ...(enriched.contact ? { contact: enriched.contact } : {}),
    ...(orgConnectors ? { orgConnectors, orgConnector: orgConnectors[0] } : {}),
    ...(enriched.connectorTeam ? { connectorTeam: enriched.connectorTeam } : {}),
    routeNodes,
  };
}
