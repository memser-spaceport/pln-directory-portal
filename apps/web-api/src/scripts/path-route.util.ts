/**
 * People-first route helpers for the neuro seed script (mirrors data-enrichment
 * path-route.util.ts — keep in sync for investor terminus + legacy fallback).
 */

import { enrichFounderContacts, type FounderResolveIndexes } from './founder-member-resolve.util';

export type RouteNodeVariant = 'member' | 'external' | 'org';

export interface RouteNode {
  label: string;
  memberUid?: string;
  teamUid?: string;
  logo?: string;
  variant: RouteNodeVariant;
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

export function plConnectorToRouteNode(connector: PlConnectorInput): RouteNode {
  return { label: connector.name, variant: 'external' };
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
  investorNode?: RouteNode;
  hops?: number;
}): RouteNode[] {
  const bridge = stripLeadingPlOrg(input.bridgeNodes);
  const prefix: RouteNode[] = input.plConnector
    ? [plConnectorToRouteNode(input.plConnector)]
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
    teams?: Array<{ name: string; teamUid?: string; logo?: string }>;
  };
  orgConnector?: { name: string; description: string; tags: string[] };
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

function pickConnectorNode(nodes: LegacyHopChainNode[]): LegacyHopChainNode | null {
  const inner = nodes.filter((n) => !isPlNode(n));
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

function bridgeRouteNodes(hc: LegacyHopChain): RouteNode[] {
  if (hc.contact) {
    return [
      {
        label: hc.contact.name,
        memberUid: hc.contact.memberUid,
        teamUid: hc.contact.teams?.[0]?.teamUid,
        logo: hc.contact.teams?.[0]?.logo,
        variant: hc.contact.memberUid ? 'member' : 'external',
      },
    ];
  }
  if (hc.routeNodes && hc.routeNodes.length > 0) {
    return stripLeadingPlOrg(hc.routeNodes);
  }
  if (hc.orgConnector) return [{ label: hc.orgConnector.name, variant: 'org' }];
  return deriveConnectorRouteNodesFromLegacy(hc);
}

/** Append investor to routeNodes; clone-safe (returns new object). */
export function finalizePersonHopChain(
  hopChain: Record<string, unknown>,
  person: { firstName: string; lastName: string; memberUid?: string },
  founderIndexes?: FounderResolveIndexes,
  hops?: number
): Record<string, unknown> {
  let enriched = enrichLegacyPresentation(hopChain as LegacyHopChain);
  if (founderIndexes) {
    enriched = enrichFounderContacts(enriched, founderIndexes);
  }
  const plConnector = enriched.plConnector ?? null;
  const bridgeNodes = bridgeRouteNodes(enriched);
  const investorNode = buildInvestorRouteNode(person);
  const routeNodes = buildFullRouteNodes({
    bridgeNodes,
    plConnector,
    investorNode,
    hops,
  });
  return {
    ...hopChain,
    ...(enriched.contact ? { contact: enriched.contact } : {}),
    ...(enriched.orgConnector ? { orgConnector: enriched.orgConnector } : {}),
    ...(enriched.connectorTeam ? { connectorTeam: enriched.connectorTeam } : {}),
    routeNodes,
  };
}
