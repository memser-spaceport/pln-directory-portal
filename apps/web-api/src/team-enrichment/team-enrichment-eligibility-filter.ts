import { Prisma } from '@prisma/client';

/**
 * Builds the team-eligibility filter shared by the enrichment marking cron,
 * force-enrich-all, force-logo-refetch-all, and the judge cron.
 *
 * TEAM_ENRICHMENT_FILTER_PRIORITY — comma-separated priorities (e.g. `'1,2,3'`).
 *   - Set: filter teams by `priority IN (...)`.
 *   - Empty or unset: filter teams by `isFund = true`.
 */
export function buildTeamEnrichmentEligibilityFilter(): Prisma.TeamWhereInput {
  const raw = process.env.TEAM_ENRICHMENT_FILTER_PRIORITY?.trim();
  if (!raw) return { isFund: true };

  const priorities = raw
    .split(',')
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((p) => Number.isInteger(p));
  if (priorities.length === 0) return { isFund: true };

  return { priority: { in: priorities } };
}
