import { PrismaService } from '../shared/prisma.service';
import { namesShareSubstantiveToken } from '../team-enrichment/shared/text.util';

export interface MatchedTeam {
  uid: string;
  name: string;
}

/**
 * Matches a LinkedIn experience's company name to an existing Directory Team.
 * Never creates a team — a miss means the field stays CannotEnrich (per the
 * request: skip, don't create).
 *
 * Two tiers, most-conservative first:
 *   1. Exact case-insensitive name equality.
 *   2. Shared substantive name token (`namesShareSubstantiveToken`, reused from
 *      team-enrichment's shared text utils — a pure function, not a service,
 *      so importing it directly here doesn't couple the two Nest modules).
 *      Deliberately conservative on purpose: a false match here would attach
 *      the member's primary team/role to the WRONG team, which is worse than
 *      leaving the field unresolved.
 */
export async function matchTeamFromCompanyName(
  prisma: PrismaService,
  companyName: string | null | undefined
): Promise<MatchedTeam | null> {
  const name = companyName?.trim();
  if (!name) return null;

  const exact = await prisma.team.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { uid: true, name: true },
  });
  if (exact) return exact;

  const candidates = await prisma.team.findMany({
    select: { uid: true, name: true },
    orderBy: { name: 'asc' },
  });
  return candidates.find((team) => namesShareSubstantiveToken(team.name, name)) ?? null;
}
