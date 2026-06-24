/**
 * Shared PL venture-lead connector loading for pathfinder seeds (Neuro + Gold).
 */
import { readFileSync } from 'fs';
import {
  DEFAULT_PL_TEAM_LEADS,
  mergePlTeamRelationship,
  type PlConnector,
  type PlTeamRelationship,
} from './pl-team-relationship.util';
import { extractRosterConnectorHints } from './affinity-roster-mapper.util';

export type PlRelEntry = PlTeamRelationship & { lpName?: string };

type AffinityEntityLike = {
  id?: number | string;
  fields?: Array<{ id: string; value?: { data?: unknown } }>;
};

/** Load `_pl_relationships_<listId>.json`; empty map if missing. */
export function loadPlConnectorsFromFile(path: string): Map<string, PlRelEntry> {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, PlRelEntry>;
    return new Map(Object.entries(raw));
  } catch {
    console.warn(`(no ${path} — PL-team connector attribution skipped)`);
    return new Map();
  }
}

function v1RelFromEntry(raw: PlRelEntry | undefined): PlTeamRelationship {
  const extended = raw as PlRelEntry & { connectors?: PlConnector[]; externalId?: number | null };
  return {
    externalId: extended?.externalId ?? null,
    connectors: extended?.connectors ?? [],
    bestConnector: extended?.bestConnector ?? null,
    summary: extended?.summary ?? null,
  };
}

/** Merge v1 relationship pull with roster key-contact / last-touch fallback per person. */
export function buildMergedPlConnectors(
  v1Map: Map<string, PlRelEntry>,
  affinityEntries: Array<{ entity: AffinityEntityLike }>,
  referenceIso: string,
): Map<string, PlRelEntry> {
  const merged = new Map<string, PlRelEntry>();
  for (const e of affinityEntries) {
    const affinityId = String(e.entity.id ?? '');
    if (!affinityId) continue;
    const result = mergePlTeamRelationship(
      v1RelFromEntry(v1Map.get(affinityId)),
      extractRosterConnectorHints(e.entity),
      DEFAULT_PL_TEAM_LEADS,
      referenceIso,
    );
    merged.set(affinityId, {
      summary: result.summary,
      bestConnector: result.bestConnector,
      connectors: result.connectors,
      externalId: result.externalId,
    });
  }
  return merged;
}
