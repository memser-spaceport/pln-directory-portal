import { Prisma } from '@prisma/client';

/**
 * The canonical "connector lens" match predicate, as a composable SQL fragment.
 *
 * A connector label matches a PathfinderPath when it hits ANY of:
 *   - hop-chain node labels (legacy graph hops),
 *   - people-first presentation fields (routeNodes, contact, org connectors, team leads),
 *   - the PL venture-team connector in `hopChain.plConnector.name`, or
 *   - the path's target investor name / firm (selecting a list member surfaces their row).
 *
 * Single-sourced here so the per-page batch match (PathfinderQueryService
 * .connectorMatches) and the full-list server-side filter (InvestorListsQuery
 * Service.listMembers) can never drift in what "connected" means.
 *
 * Assumes the caller has already normalized inputs (lowercased + trimmed, contains
 * filtered to a sane min length) and that at least one of `labels` /
 * `containsLabels` is non-empty. The fragment references the PathfinderPath
 * alias `p`, so callers must alias the table `p` in their query.
 */
export function connectorMatchClause(labels: string[], containsLabels: string[]): Prisma.Sql {
  const parts: Prisma.Sql[] = [];

  const nodePredicates: Prisma.Sql[] = [];
  if (labels.length > 0) {
    nodePredicates.push(Prisma.sql`lower(btrim(n->>'label')) IN (${Prisma.join(labels)})`);
  }
  for (const label of containsLabels) {
    nodePredicates.push(Prisma.sql`lower(btrim(n->>'label')) LIKE ${'%' + label + '%'}`);
  }
  if (nodePredicates.length > 0) {
    parts.push(Prisma.sql`(
      jsonb_typeof(p."hopChain"->'nodes') = 'array' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p."hopChain"->'nodes') AS n
        WHERE ${Prisma.join(nodePredicates, ' OR ')}
      )
    )`);
  }

  parts.push(...scalarFieldPredicates(`p."hopChain"->'plConnector'->>'name'`, labels, containsLabels));
  parts.push(...scalarFieldPredicates(`p."hopChain"->'contact'->>'name'`, labels, containsLabels));
  parts.push(...scalarFieldPredicates(`p."hopChain"->'orgConnector'->>'name'`, labels, containsLabels));
  parts.push(
    ...scalarFieldPredicates(`p."hopChain"->'connectorTeam'->>'name'`, labels, containsLabels),
  );

  parts.push(...arrayFieldPredicates(`p."hopChain"->'routeNodes'`, 'label', labels, containsLabels));
  parts.push(...arrayFieldPredicates(`p."hopChain"->'routeNodes'`, 'orgName', labels, containsLabels));
  parts.push(...arrayFieldPredicates(`p."hopChain"->'orgConnectors'`, 'name', labels, containsLabels));
  parts.push(
    ...arrayFieldPredicates(`p."hopChain"->'connectorTeam'->'leads'`, 'name', labels, containsLabels),
  );

  parts.push(targetInvestorPredicates(labels, containsLabels));

  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

function scalarFieldPredicates(jsonExpr: string, labels: string[], containsLabels: string[]): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [];
  if (labels.length > 0) {
    parts.push(Prisma.sql`lower(btrim(${Prisma.raw(jsonExpr)})) IN (${Prisma.join(labels)})`);
  }
  for (const label of containsLabels) {
    parts.push(Prisma.sql`lower(btrim(${Prisma.raw(jsonExpr)})) LIKE ${'%' + label + '%'}`);
  }
  return parts;
}

function arrayFieldPredicates(
  arrayExpr: string,
  field: string,
  labels: string[],
  containsLabels: string[],
): Prisma.Sql[] {
  const elemPredicates: Prisma.Sql[] = [];
  const fieldExpr = `elem->>'${field}'`;
  if (labels.length > 0) {
    elemPredicates.push(Prisma.sql`lower(btrim(${Prisma.raw(fieldExpr)})) IN (${Prisma.join(labels)})`);
  }
  for (const label of containsLabels) {
    elemPredicates.push(Prisma.sql`lower(btrim(${Prisma.raw(fieldExpr)})) LIKE ${'%' + label + '%'}`);
  }
  if (elemPredicates.length === 0) return [];

  return [
    Prisma.sql`(
      jsonb_typeof(${Prisma.raw(arrayExpr)}) = 'array' AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(${Prisma.raw(arrayExpr)}) AS elem
        WHERE ${Prisma.join(elemPredicates, ' OR ')}
      )
    )`,
  ];
}

/** Selecting a list member by name/firm also matches their own path rows. */
function targetInvestorPredicates(labels: string[], containsLabels: string[]): Prisma.Sql {
  const invPredicates: Prisma.Sql[] = [];
  const fullName = `lower(btrim(concat_ws(' ', target_inv."firstName", target_inv."lastName"))) `;
  if (labels.length > 0) {
    invPredicates.push(Prisma.sql`${Prisma.raw(fullName)} IN (${Prisma.join(labels)})`);
    invPredicates.push(Prisma.sql`lower(btrim(target_inv."firm")) IN (${Prisma.join(labels)})`);
  }
  for (const label of containsLabels) {
    invPredicates.push(Prisma.sql`${Prisma.raw(fullName)} LIKE ${'%' + label + '%'}`);
    invPredicates.push(Prisma.sql`lower(btrim(target_inv."firm")) LIKE ${'%' + label + '%'}`);
  }

  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "InvestorOutreachRecord" target_inv
    WHERE target_inv."investorId" = p."targetInvestorId"
      AND (${Prisma.join(invPredicates, ' OR ')})
  )`;
}
