import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { SuggestedCandidate, SuggestedCandidatesResponse } from 'libs/contracts/src/schema/job-opening';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../shared/prisma.service';
import { memberProfileUrl } from './job-openings-url';
import {
  CriterionResult,
  hasWorkedAtTeam,
  isLiveRole,
  labelForScore,
  SUGGESTED_CANDIDATES_LIMIT,
} from './job-openings-suggested-candidates-match';

/**
 * Serves stored suggested candidates for one role (LAB-2770). Never calls the
 * AI provider: the rows come from JobOpeningsSuggestedCandidatesComputeService.
 */
@Injectable()
export class JobOpeningsSuggestedCandidatesService {
  constructor(private readonly prisma: PrismaService, private readonly membersService: MembersService) {}

  /**
   * Up to five suggestions, best first. Only members of the hiring team and
   * Directory admins may read them; a role that is not live answers empty.
   */
  async listForRole(jobUid: string, viewerEmail?: string): Promise<SuggestedCandidatesResponse> {
    if (!viewerEmail) {
      throw new UnauthorizedException('Sign in to see suggested candidates');
    }

    const role = await this.prisma.jobOpening.findUnique({
      where: { uid: jobUid },
      select: {
        uid: true,
        status: true,
        teamUid: true,
        team: { select: { uid: true, name: true } },
      },
    });
    if (!role) {
      throw new NotFoundException('Job opening not found');
    }

    await this.assertCanView(viewerEmail, role.teamUid);

    const empty: SuggestedCandidatesResponse = { jobUid: role.uid, criteria: [], computedAt: null, items: [] };
    if (!isLiveRole(role) || !role.team) {
      return empty;
    }
    const team = role.team;

    const set = await this.prisma.jobOpeningCandidateSuggestionSet.findUnique({
      where: { jobOpeningUid: role.uid },
      select: { criteria: true, computedAt: true },
    });
    if (!set) {
      return empty;
    }

    const rows = await this.prisma.jobOpeningSuggestedCandidate.findMany({
      where: { jobOpeningUid: role.uid, member: { deletedAt: null } },
      orderBy: { rank: 'asc' },
      select: {
        score: true,
        criteriaResults: true,
        member: {
          select: {
            uid: true,
            name: true,
            role: true,
            image: { select: { url: true } },
            experiences: { select: { company: true } },
            teamMemberRoles: { select: { teamUid: true } },
          },
        },
      },
    });

    // Stored rows can be up to a day old: re-apply the exclusion and the floor
    // so someone who joined the team since, or a row below the floor, never shows.
    const items: SuggestedCandidate[] = [];
    for (const row of rows) {
      const label = labelForScore(row.score);
      if (!label || hasWorkedAtTeam(row.member, team)) continue;
      items.push({
        rank: items.length + 1,
        label,
        score: row.score,
        member: {
          uid: row.member.uid,
          name: row.member.name,
          imageUrl: row.member.image?.url ?? null,
          role: row.member.role ?? null,
          profileUrl: memberProfileUrl(row.member.uid),
        },
        criteria: toCriteria(row.criteriaResults),
      });
      if (items.length === SUGGESTED_CANDIDATES_LIMIT) break;
    }

    return { jobUid: role.uid, criteria: set.criteria, computedAt: set.computedAt.toISOString(), items };
  }

  /** Directory admins, or a member with a current (not ended) role on the hiring team. */
  private async assertCanView(viewerEmail: string, teamUid: string | null): Promise<void> {
    const viewer = await this.membersService.findMemberByEmail(viewerEmail);
    if (!viewer || viewer.deletedAt) {
      throw new ForbiddenException('Only the hiring team can see suggested candidates');
    }
    if (viewer.isDirectoryAdmin === true) return;
    const now = Date.now();
    const onTeam =
      teamUid != null &&
      (viewer.teamMemberRoles ?? []).some(
        (teamRole: { teamUid: string; endDate: Date | null }) =>
          teamRole.teamUid === teamUid && (!teamRole.endDate || new Date(teamRole.endDate).getTime() > now)
      );
    if (!onTeam) {
      throw new ForbiddenException('Only the hiring team can see suggested candidates');
    }
  }
}

function toCriteria(value: unknown): CriterionResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is CriterionResult =>
        item != null && typeof item.criterion === 'string' && typeof item.matched === 'boolean'
    )
    .map((item) => ({ criterion: item.criterion, matched: item.matched }));
}
