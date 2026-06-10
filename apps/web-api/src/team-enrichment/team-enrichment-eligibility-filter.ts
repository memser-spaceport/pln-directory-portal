import { Prisma } from '@prisma/client';

/**
 * Builds the team-eligibility filter shared by the enrichment marking cron,
 * force-enrich-all, force-logo-refetch-all, and the judge cron.
 *
 * TEAM_ENRICHMENT_FILTER_PRIORITY — comma-separated priorities (e.g. `'1,2,3'`).
 *   Active when set to a non-empty list of integers. Adds `priority IN (...)`.
 *
 * TEAM_ENRICHMENT_FILTER_IS_FUND — `'true'` / `'false'` (case-insensitive).
 *   Active when set to `'true'`. Adds `isFund = true`.
 *
 * Active clauses are combined with OR (e.g. priority=1,2,3 + isFund=true →
 * "fund teams OR priority 1/2/3 teams").
 *
 * If neither filter is active, falls back to `isFund = true` for backward
 * compatibility with deployments predating `TEAM_ENRICHMENT_FILTER_IS_FUND`.
 */
function parseEligibilityEnv(): { priorities: number[]; includeFundTeams: boolean } {
  const priorityRaw = process.env.TEAM_ENRICHMENT_FILTER_PRIORITY?.trim();
  const priorities = priorityRaw
    ? priorityRaw
        .split(',')
        .map((p) => Number.parseInt(p.trim(), 10))
        .filter((p) => Number.isInteger(p))
    : [];

  const isFundRaw = process.env.TEAM_ENRICHMENT_FILTER_IS_FUND?.trim().toLowerCase();
  const includeFundTeams = isFundRaw === 'true';

  return { priorities, includeFundTeams };
}

export function buildTeamEnrichmentEligibilityFilter(): Prisma.TeamWhereInput {
  const { priorities, includeFundTeams } = parseEligibilityEnv();

  const clauses: Prisma.TeamWhereInput[] = [];
  if (priorities.length > 0) clauses.push({ priority: { in: priorities } });
  if (includeFundTeams) clauses.push({ isFund: true });

  if (clauses.length === 0) return { isFund: true };
  if (clauses.length === 1) return clauses[0];
  return { OR: clauses };
}
