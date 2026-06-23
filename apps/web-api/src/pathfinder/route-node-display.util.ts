/**
 * Map stored hopChain JSON (routeNodes or legacy nodes) to PathHopNodeDto for
 * list/table display. Pure — no I/O.
 */
import { PathHopNodeDto, PathRouteNode, RouteNodeContact } from './dto/ingest-pathfinder.dto';

const PL_IDS = new Set(['pl']);
const PL_LABELS = new Set(['protocol labs']);

interface LegacyHopChainNode {
  id?: string;
  label?: string;
  type?: 'person' | 'org';
}

interface HopChainLike {
  routeNodes?: PathRouteNode[];
  nodes?: LegacyHopChainNode[];
}

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

function pickConnectorNode(nodes: LegacyHopChainNode[]): LegacyHopChainNode | null {
  const inner = nodes.filter((n) => !isPlNode(n) && !isPlaceholderInvestorNode(n));
  if (inner.length <= 1) return inner[0] ?? null;
  return inner[0] ?? null;
}

function deriveFromLegacyNodes(nodes: LegacyHopChainNode[]): PathRouteNode[] {
  const connectorNode = pickConnectorNode(nodes);
  if (!connectorNode?.label) return [];
  if (isPersonNode(connectorNode)) {
    return [{ label: connectorNode.label, variant: 'external' }];
  }
  return [{ label: connectorNode.label, variant: 'org' }];
}

export function routeNodeToHopNodeDto(node: PathRouteNode, index: number): PathHopNodeDto {
  const id = `route-${index}`;
  const primary = node.contacts?.[0];
  const label = primary?.name ?? node.label;
  const memberUid = primary?.memberUid ?? node.memberUid;
  const imageUrl = primary?.imageUrl;
  const email = primary?.email;

  if (primary || node.variant === 'member' || node.variant === 'external') {
    const dto: PathHopNodeDto = {
      id,
      label,
      type: 'person',
      orgName: node.orgName,
      contacts: node.contacts,
    };
    if (memberUid) dto.memberUid = memberUid;
    if (imageUrl) dto.imageUrl = imageUrl;
    if (email) dto.email = email;
    return dto;
  }
  if (node.teamUid) {
    return { id, label: node.label, type: 'org', teamUid: node.teamUid, orgName: node.orgName, contacts: node.contacts };
  }
  return { id, label: node.label, type: 'org', orgName: node.orgName, contacts: node.contacts };
}

/** Connector-only route nodes (investor terminus is appended separately when needed). */
export function parseConnectorRouteNodes(hopChain: unknown): PathRouteNode[] {
  if (!hopChain || typeof hopChain !== 'object') return [];
  const hc = hopChain as HopChainLike;
  if (Array.isArray(hc.routeNodes) && hc.routeNodes.length > 0) {
    return hc.routeNodes.filter((n) => n?.label);
  }
  return deriveFromLegacyNodes(hc.nodes ?? []);
}

/**
 * Full table route from hopChain.routeNodes (connector + investor terminus).
 * Falls back to legacy nodes when routeNodes absent.
 */
export function parseRouteNodesFromHopChain(hopChain: unknown): PathHopNodeDto[] {
  if (!hopChain || typeof hopChain !== 'object') return [];
  const hc = hopChain as HopChainLike;
  let routeNodes: PathRouteNode[];
  if (Array.isArray(hc.routeNodes) && hc.routeNodes.length > 0) {
    routeNodes = hc.routeNodes.filter((n) => n?.label && n.label.toLowerCase() !== 'investor');
  } else {
    const nodes = hc.nodes ?? [];
    const connector = deriveFromLegacyNodes(nodes);
    const last = nodes.filter((n) => !isPlNode(n) && !isPlaceholderInvestorNode(n)).at(-1);
    if (last?.label && connector.length > 0) {
      const terminus: PathRouteNode = isPersonNode(last)
        ? { label: last.label, variant: 'external' }
        : { label: last.label, variant: 'org' };
      routeNodes = [...connector, terminus];
    } else {
      routeNodes = connector;
    }
  }
  return routeNodes.map(routeNodeToHopNodeDto);
}
