import { Prisma } from '@prisma/client';

export const PATH_SOURCES = ['affinity', 'linkedin'] as const;
export type PathSourceFilter = typeof PATH_SOURCES[number];

export type PathSourceTag = 'Affinity' | 'LinkedIn';

/** Normalize query value to `affinity` | `linkedin`, or null when absent/invalid. */
export function parsePathSource(raw: string | undefined | null): PathSourceFilter | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'affinity' || v === 'linkedin') return v;
  return null;
}

export function hasPathSourceFilter(source: PathSourceFilter | null): source is PathSourceFilter {
  return source !== null;
}

/**
 * Path matches LinkedIn when attributionLines has source LinkedIn, or socialOverlap is set.
 * Path matches Affinity when attributionLines has source Affinity.
 * References PathfinderPath alias `p`.
 */
export function pathSourceMatchClause(source: PathSourceFilter): Prisma.Sql {
  if (source === 'linkedin') {
    return Prisma.sql`(
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(p."hopChain"->'attributionLines') = 'array'
            THEN p."hopChain"->'attributionLines'
            ELSE '[]'::jsonb 
          END
        ) AS line
        WHERE line->>'source' = 'LinkedIn'
      )
      OR p."socialOverlap" IS NOT NULL
    )`;
  }

  return Prisma.sql`(
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p."hopChain"->'attributionLines') = 'array'
          THEN p."hopChain"->'attributionLines'
          ELSE '[]'::jsonb
        END
      ) AS line
      WHERE line->>'source' = 'Affinity'
    )
  )`;
}
