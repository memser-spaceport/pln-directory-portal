import { Prisma } from '@prisma/client';

/** Split a keyword query into AND tokens (mirrors investor-text-search.util). */
export function tokenizeKeywordQuery(q: string): string[] {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

/** One token must match founder contact name or any team name on the path. */
export function pathKeywordTokenClause(token: string): Prisma.Sql {
  const pattern = `%${token}%`;
  return Prisma.sql`(
    lower(p."hopChain"->'contact'->>'name') LIKE ${pattern}
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p."hopChain"->'contact'->'teams') = 'array'
            THEN p."hopChain"->'contact'->'teams'
          ELSE '[]'::jsonb
        END
      ) AS team
      WHERE lower(team->>'name') LIKE ${pattern}
    )
  )`;
}

/**
 * Token-AND match on path founder contact fields. References PathfinderPath alias `p`.
 * Caller must pass a non-empty token list.
 */
export function pathKeywordMatchClause(tokens: string[]): Prisma.Sql {
  if (tokens.length === 0) {
    throw new Error('pathKeywordMatchClause requires at least one token');
  }
  const clauses = tokens.map((token) => pathKeywordTokenClause(token));
  if (clauses.length === 1) return clauses[0];
  return Prisma.sql`(${Prisma.join(clauses, ' AND ')})`;
}
