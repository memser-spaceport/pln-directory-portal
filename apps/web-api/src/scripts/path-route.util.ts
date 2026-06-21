/**
 * People-first route helpers for the neuro seed script (mirrors data-enrichment
 * path-route.util.ts — keep in sync for investor terminus + legacy fallback).
 */

export type RouteNodeVariant = 'member' | 'external' | 'org';

export interface RouteNode {
  label: string;
  memberUid?: string;
  teamUid?: string;
  logo?: string;
  variant: RouteNodeVariant;
}

interface LegacyHopChainNode {
  id?: string;
  label?: string;
  type?: 'person' | 'org';
}

interface LegacyHopChain {
  nodes?: LegacyHopChainNode[];
  routeNodes?: RouteNode[];
  contact?: { name: string; role: string };
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

function connectorRouteNodes(hc: LegacyHopChain): RouteNode[] {
  if (hc.routeNodes && hc.routeNodes.length > 0) return hc.routeNodes;
  if (hc.contact) return [{ label: hc.contact.name, variant: 'external' }];
  if (hc.orgConnector) return [{ label: hc.orgConnector.name, variant: 'org' }];
  return deriveConnectorRouteNodesFromLegacy(hc);
}

/** Append investor to routeNodes; clone-safe (returns new object). */
export function finalizePersonHopChain(
  hopChain: Record<string, unknown>,
  person: { firstName: string; lastName: string; memberUid?: string }
): Record<string, unknown> {
  const enriched = enrichLegacyPresentation(hopChain as LegacyHopChain);
  const connectorNodes = connectorRouteNodes(enriched);
  const investorNode = buildInvestorRouteNode(person);
  return {
    ...hopChain,
    ...(enriched.contact ? { contact: enriched.contact } : {}),
    ...(enriched.orgConnector ? { orgConnector: enriched.orgConnector } : {}),
    ...(enriched.connectorTeam ? { connectorTeam: enriched.connectorTeam } : {}),
    routeNodes: [...connectorNodes, investorNode],
  };
}
