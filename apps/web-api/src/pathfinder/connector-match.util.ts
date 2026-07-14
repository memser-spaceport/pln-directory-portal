import { Prisma } from '@prisma/client';

export type ConnectorMatchKind = 'person' | 'org' | 'all';

/**
 * The canonical "connector lens" match predicate, as a composable SQL fragment.
 *
 * A connector label matches a PathfinderPath when it hits ANY of the fields for
 * the requested kind:
 *   - person: hop node labels, people-first route/contact/leads, plConnector, target name
 *   - org: typed org hop nodes, org connectors/team name, routeNodes.orgName, target firm
 *   - all: both partitions (legacy / omitted kind)
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
export function connectorMatchClause(
  labels: string[],
  containsLabels: string[],
  kind: ConnectorMatchKind = 'all'
): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  const includePerson = kind === 'person' || kind === 'all';
  const includeOrg = kind === 'org' || kind === 'all';

  if (includePerson) {
    parts.push(...hopNodeLabelPredicates(labels, containsLabels, null));
    parts.push(...scalarFieldPredicates(`p."hopChain"->'plConnector'->>'name'`, labels, containsLabels));
    parts.push(...scalarFieldPredicates(`p."hopChain"->'contact'->>'name'`, labels, containsLabels));
    parts.push(...arrayFieldPredicates(`p."hopChain"->'routeNodes'`, 'label', labels, containsLabels));
    parts.push(...arrayFieldPredicates(`p."hopChain"->'connectorTeam'->'leads'`, 'name', labels, containsLabels));
  }

  if (includeOrg) {
    parts.push(...hopNodeLabelPredicates(labels, containsLabels, 'org'));
    parts.push(...scalarFieldPredicates(`p."hopChain"->'orgConnector'->>'name'`, labels, containsLabels));
    parts.push(...scalarFieldPredicates(`p."hopChain"->'connectorTeam'->>'name'`, labels, containsLabels));
    parts.push(...arrayFieldPredicates(`p."hopChain"->'routeNodes'`, 'orgName', labels, containsLabels));
    parts.push(...arrayFieldPredicates(`p."hopChain"->'orgConnectors'`, 'name', labels, containsLabels));
  }

  parts.push(targetInvestorPredicates(labels, containsLabels, kind));

  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

function hopNodeLabelPredicates(labels: string[], containsLabels: string[], nodeType: 'org' | null): Prisma.Sql[] {
  const nodePredicates: Prisma.Sql[] = [];
  if (labels.length > 0) {
    nodePredicates.push(Prisma.sql`lower(btrim(n->>'label')) IN (${Prisma.join(labels)})`);
  }
  for (const label of containsLabels) {
    nodePredicates.push(Prisma.sql`lower(btrim(n->>'label')) LIKE ${'%' + label + '%'}`);
  }
  if (nodePredicates.length === 0) return [];

  if (nodeType === 'org') {
    return [
      Prisma.sql`(
        jsonb_typeof(p."hopChain"->'nodes') = 'array' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(p."hopChain"->'nodes') AS n
          WHERE (${Prisma.join(nodePredicates, ' OR ')})
            AND lower(btrim(n->>'type')) = 'org'
        )
      )`,
    ];
  }

  return [
    Prisma.sql`(
      jsonb_typeof(p."hopChain"->'nodes') = 'array' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p."hopChain"->'nodes') AS n
        WHERE ${Prisma.join(nodePredicates, ' OR ')}
      )
    )`,
  ];
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
  containsLabels: string[]
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
function targetInvestorPredicates(labels: string[], containsLabels: string[], kind: ConnectorMatchKind): Prisma.Sql {
  const invPredicates: Prisma.Sql[] = [];
  const fullName = `lower(btrim(concat_ws(' ', target_inv."firstName", target_inv."lastName"))) `;
  const includePerson = kind === 'person' || kind === 'all';
  const includeOrg = kind === 'org' || kind === 'all';

  if (labels.length > 0) {
    if (includePerson) {
      invPredicates.push(Prisma.sql`${Prisma.raw(fullName)} IN (${Prisma.join(labels)})`);
    }
    if (includeOrg) {
      invPredicates.push(Prisma.sql`lower(btrim(target_inv."firm")) IN (${Prisma.join(labels)})`);
    }
  }
  for (const label of containsLabels) {
    if (includePerson) {
      invPredicates.push(Prisma.sql`${Prisma.raw(fullName)} LIKE ${'%' + label + '%'}`);
    }
    if (includeOrg) {
      invPredicates.push(Prisma.sql`lower(btrim(target_inv."firm")) LIKE ${'%' + label + '%'}`);
    }
  }

  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "InvestorOutreachRecord" target_inv
    WHERE target_inv."investorId" = p."targetInvestorId"
      AND (${Prisma.join(invPredicates, ' OR ')})
  )`;
}
