import { Prisma } from '@prisma/client';

/**
 * Builds the member-eligibility filter shared by the marking cron and the
 * "trigger for all pending" admin endpoint. Mirrors
 * `team-enrichment-eligibility-filter.ts`'s process.env-read, OR-composed
 * pattern, but member-scoped and reaching through `TeamMemberRole` since
 * `priority` / `isFund` live on `Team`, not `Member`.
 *
 * `isInvestor: true` is always included — an unconditional category from the
 * request, not something the env vars gate away.
 *
 * MEMBER_ENRICHMENT_FILTER_IS_FUND — 'true' / 'false' (case-insensitive).
 *   Default 'true'. Adds `teamMemberRoles: { some: { team: { isFund: true } } }`.
 *
 * MEMBER_ENRICHMENT_FILTER_PRIORITY — comma-separated Team.priority values.
 *   Default '1,2,3'. Adds `teamMemberRoles: { some: { team: { priority: { in: [...] } } } }`.
 *
 * Unlike the team version, both defaults are pre-populated (not opt-in) because
 * the request explicitly wants investors + fund + P1-P3 members enrolled out of
 * the box.
 */
function parseEligibilityEnv(): { priorities: number[]; includeFundTeamMembers: boolean } {
  const priorityRaw = (process.env.MEMBER_ENRICHMENT_FILTER_PRIORITY ?? '1,2,3').trim();
  const priorities = priorityRaw
    ? priorityRaw
        .split(',')
        .map((p) => Number.parseInt(p.trim(), 10))
        .filter((p) => Number.isInteger(p))
    : [];

  const isFundRaw = (process.env.MEMBER_ENRICHMENT_FILTER_IS_FUND ?? 'true').trim().toLowerCase();
  const includeFundTeamMembers = isFundRaw === 'true';

  return { priorities, includeFundTeamMembers };
}

export function buildMemberEnrichmentEligibilityFilter(): Prisma.MemberWhereInput {
  const { priorities, includeFundTeamMembers } = parseEligibilityEnv();

  const clauses: Prisma.MemberWhereInput[] = [{ isInvestor: true }];
  if (includeFundTeamMembers) {
    clauses.push({ teamMemberRoles: { some: { team: { isFund: true } } } });
  }
  if (priorities.length > 0) {
    clauses.push({ teamMemberRoles: { some: { team: { priority: { in: priorities } } } } });
  }

  return { OR: clauses };
}
