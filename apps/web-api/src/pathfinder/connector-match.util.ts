import { Prisma } from '@prisma/client';

/**
 * The canonical "connector lens" match predicate, as a composable SQL fragment.
 *
 * A connector label matches a PathfinderPath when it hits EITHER:
 *   - a hop-chain NODE label  (founders, firms, the JB rolodex node, …), or
 *   - the PL venture-team CONNECTOR name in `hopChain.plConnector.name` (the
 *     relationship-axis attribution from task 01 — a structured field, NOT a node).
 *
 * Single-sourced here so the per-page batch match (PathfinderQueryService
 * .connectorMatches) and the full-list server-side filter (InvestorListsQuery
 * Service.listMembers) can never drift in what "connected" means.
 *
 * Assumes the caller has already normalized inputs (lowercased + trimmed, contains
 * filtered to a sane min length) and that at least one of `labels` /
 * `containsLabels` is non-empty. The fragment references the `PathfinderPath`
 * alias `p`, so callers must alias the table `p` in their query.
 */
export function connectorMatchClause(labels: string[], containsLabels: string[]): Prisma.Sql {
  const nodeParts: Prisma.Sql[] = [];
  const plConnectorParts: Prisma.Sql[] = [];

  if (labels.length > 0) {
    nodeParts.push(Prisma.sql`lower(btrim(n->>'label')) IN (${Prisma.join(labels)})`);
    plConnectorParts.push(Prisma.sql`lower(btrim(p."hopChain"->'plConnector'->>'name')) IN (${Prisma.join(labels)})`);
  }
  for (const label of containsLabels) {
    nodeParts.push(Prisma.sql`lower(btrim(n->>'label')) LIKE ${'%' + label + '%'}`);
    plConnectorParts.push(Prisma.sql`lower(btrim(p."hopChain"->'plConnector'->>'name')) LIKE ${'%' + label + '%'}`);
  }

  const nodeMatch = Prisma.sql`(
    jsonb_typeof(p."hopChain"->'nodes') = 'array' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(p."hopChain"->'nodes') AS n
      WHERE ${Prisma.join(nodeParts, ' OR ')}
    )
  )`;
  const plConnectorMatch = Prisma.sql`(${Prisma.join(plConnectorParts, ' OR ')})`;

  return Prisma.sql`(${nodeMatch} OR ${plConnectorMatch})`;
}
