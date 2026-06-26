import { Prisma } from '@prisma/client';
import {
  founderBrokerPresentClause,
  founderIdentityMatchClause,
} from './founder-contact.util';

export const MAX_PATH_VIA_VALUES = 20;

export interface PathViaFilterInput {
  /** Lowercased PL connector names (`hopChain.plConnector.name`). */
  plMembers: string[];
  /** Founder LabOS member uids (normalized lowercase). */
  founderUids: string[];
  /** Founder contact display names (normalized lowercase). Primary key when uid absent. */
  founderNames: string[];
  anyFounder: boolean;
  directOnly: boolean;
}

export function hasPathViaFilters(input: PathViaFilterInput): boolean {
  return (
    input.plMembers.length > 0 ||
    input.founderUids.length > 0 ||
    input.founderNames.length > 0 ||
    input.anyFounder ||
    input.directOnly
  );
}

/** Direct PL → investor path with no founder/VC broker in hopChain.contact. */
export function directOnlyPathClause(): Prisma.Sql {
  return Prisma.sql`(
    (
      jsonb_typeof(p."hopChain"->'routeNodes') = 'array'
      AND (
        SELECT count(*)::int
        FROM jsonb_array_elements(p."hopChain"->'routeNodes') AS rn
        WHERE lower(btrim(rn->>'label')) <> 'investor'
      ) = 1
      AND p."hopChain"->'plConnector'->>'name' IS NOT NULL
      AND btrim(p."hopChain"->'plConnector'->>'name') <> ''
      AND (
        p."hopChain"->'contact' IS NULL
        OR jsonb_typeof(p."hopChain"->'contact') = 'null'
      )
    )
    OR (
      (p."hopChain"->'routeNodes' IS NULL OR jsonb_typeof(p."hopChain"->'routeNodes') <> 'array')
      AND p."connectorType" = 'PL'
      AND p."hops" = 1
    )
  )`;
}

/**
 * OR-composed path-via predicate for warm-intros structured filters.
 * References PathfinderPath alias `p`. Caller must ensure at least one filter is active.
 */
export function pathViaMatchClause(input: PathViaFilterInput): Prisma.Sql {
  const parts: Prisma.Sql[] = [];

  if (input.plMembers.length > 0) {
    parts.push(
      Prisma.sql`(
        lower(btrim(p."hopChain"->'plConnector'->>'name')) IN (${Prisma.join(input.plMembers)})
      )`
    );
  }

  if (input.founderUids.length > 0 || input.founderNames.length > 0) {
    parts.push(
      Prisma.sql`(
        p."connectorType" = 'F'
        AND ${founderBrokerPresentClause()}
        AND ${founderIdentityMatchClause(input.founderUids, input.founderNames)}
      )`
    );
  }

  if (input.anyFounder) {
    parts.push(Prisma.sql`(p."connectorType" = 'F')`);
  }

  if (input.directOnly) {
    parts.push(directOnlyPathClause());
  }

  if (parts.length === 0) {
    throw new Error('pathViaMatchClause requires at least one active filter');
  }

  if (parts.length === 1) return parts[0];
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}
