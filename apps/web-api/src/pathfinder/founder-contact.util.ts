import { Prisma } from '@prisma/client';

/**
 * Portfolio founder who brokers the F-path intro — NOT the LP firm stored in
 * hopChain.contact (e.g. "Sequoia Capital"). Sourced from:
 *   1. legacy hop node id `f_*` (graph founder), else
 *   2. connectorTeam.leads[0].name (seed enrichment).
 * References PathfinderPath alias `p`.
 */
export function founderBrokerNameSql(): Prisma.Sql {
  return Prisma.sql`COALESCE(
    NULLIF(btrim((
      SELECT n->>'label'
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p."hopChain"->'nodes') = 'array' THEN p."hopChain"->'nodes'
          ELSE '[]'::jsonb
        END
      ) AS n
      WHERE n->>'id' LIKE 'f_%'
      LIMIT 1
    )), ''),
    NULLIF(btrim(p."hopChain"->'connectorTeam'->'leads'->0->>'name'), '')
  )`;
}

export function founderBrokerMemberUidSql(): Prisma.Sql {
  return Prisma.sql`NULLIF(btrim(p."hopChain"->'connectorTeam'->'leads'->0->>'memberUid'), '')`;
}

export function founderBrokerRoleSql(): Prisma.Sql {
  return Prisma.sql`NULLIF(btrim(p."hopChain"->'connectorTeam'->'leads'->0->>'role'), '')`;
}

export function founderBrokerTeamsSql(): Prisma.Sql {
  return Prisma.sql`p."hopChain"->'connectorTeam'->'leads'->0->'teams'`;
}

/** F-type path with a resolvable portfolio-founder broker (person), not just an LP org contact. */
export function founderBrokerPresentClause(): Prisma.Sql {
  return Prisma.sql`(
    ${founderBrokerNameSql()} IS NOT NULL
    AND btrim(${founderBrokerNameSql()}) <> ''
  )`;
}

/** Match specific founders by LabOS uid and/or broker display name (OR). */
export function founderIdentityMatchClause(founderUids: string[], founderNames: string[]): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (founderUids.length > 0) {
    parts.push(Prisma.sql`lower(btrim(${founderBrokerMemberUidSql()})) IN (${Prisma.join(founderUids)})`);
  }
  if (founderNames.length > 0) {
    parts.push(Prisma.sql`lower(btrim(${founderBrokerNameSql()})) IN (${Prisma.join(founderNames)})`);
  }
  if (parts.length === 0) {
    throw new Error('founderIdentityMatchClause requires uids and/or names');
  }
  if (parts.length === 1) return parts[0];
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}
