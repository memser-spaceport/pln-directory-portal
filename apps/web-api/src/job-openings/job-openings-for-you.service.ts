import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { buildJobOpeningDateWhere } from './job-opening-date.where';
import { hasJobTextMatch, tokenizeJobMatchText } from './job-openings-for-you-match';
import { HIDDEN_JOB_OPENING_STATUSES, JobOpeningsQueryService } from './job-openings-query.service';
import { isInAppApplyAvailable } from './pin-protocol-labs-team';

/** "Only include jobs from the last two weeks" — the same window the newsfeed
 *  itself shows (TEAM_NEWS_DEFAULT_WINDOW_DAYS on the frontend). */
const FOR_YOU_WINDOW_DAYS = 14;

/**
 * Team roll-ups returned — the ceiling for every client of this endpoint.
 *
 * The newsfeed shows fewer (its own `MAX_FOR_YOU_JOB_ENTRIES`); the surplus is
 * headroom, the same shape the unpersonalized rail already requests. Raise this
 * before raising the frontend's cap past it, or the extra slots stay empty.
 */
const FOR_YOU_GROUP_LIMIT = 10;

type CandidateJob = Awaited<ReturnType<typeof loadCandidates>>[number];

type MatchedRole = {
  displayDate: Date;
  role: CandidateJob;
};

@Injectable()
export class JobOpeningsForYouService {
  constructor(private readonly prisma: PrismaService, private readonly queryService: JobOpeningsQueryService) {}

  /**
   * Jobs matching this member, grouped per team, freshest first.
   *
   * A job qualifies on one signal only: its own role words overlap the member's
   * skills, current role, or past experience titles (`hasJobTextMatch`). Whether
   * the member follows or is suggested the team is deliberately irrelevant —
   * a role you could not do is not "for you" just because you know the team.
   *
   * The member's own teams are excluded outright: a personalized card for a
   * role at the company you already work at reads as a mistake.
   *
   * Tolerant like the board's own list — an anonymous, unknown, or deleted
   * caller gets an empty set, never an error.
   */
  async listForYou(viewerEmail?: string) {
    const member = await this.loadMember(viewerEmail);
    if (!member) {
      return { groups: [] };
    }

    const ownTeamUids = new Set(member.teamMemberRoles.map((teamRole) => teamRole.teamUid));
    const candidates = await loadCandidates(this.prisma, ownTeamUids);

    const memberTokens = tokenizeJobMatchText([
      member.role,
      ...member.teamMemberRoles.map((teamRole) => teamRole.role),
      ...member.skills.map((skill) => skill.title),
      ...member.experiences.map((experience) => experience.title),
    ]);

    const matchesByTeam = new Map<string, MatchedRole[]>();
    for (const candidate of candidates) {
      if (!candidate.teamUid || !candidate.team) continue;
      const jobTokens = tokenizeJobMatchText([
        candidate.roleTitle,
        candidate.roleCategory,
        candidate.department,
        candidate.seniority,
      ]);
      if (!hasJobTextMatch(memberTokens, jobTokens)) continue;

      const matched: MatchedRole = {
        displayDate: candidate.postedDate ?? candidate.detectionDate ?? candidate.updatedAt,
        role: candidate,
      };
      const existing = matchesByTeam.get(candidate.teamUid);
      if (existing) existing.push(matched);
      else matchesByTeam.set(candidate.teamUid, [matched]);
    }

    // Freshest match first, then name — a stable order for a member whose
    // matches all land on the same day.
    const rankedTeams = [...matchesByTeam.values()]
      .map((roles) =>
        [...roles].sort(
          (a, b) => b.displayDate.getTime() - a.displayDate.getTime() || a.role.uid.localeCompare(b.role.uid)
        )
      )
      .sort(
        (a, b) =>
          b[0].displayDate.getTime() - a[0].displayDate.getTime() || teamName(a[0]).localeCompare(teamName(b[0]))
      )
      .slice(0, FOR_YOU_GROUP_LIMIT);

    const roleUids = rankedTeams.flatMap((roles) => roles.map((matched) => matched.role.uid));
    const { counts, viewerInterested } = await this.queryService.loadInterestStamps(roleUids, member.uid);

    return {
      groups: rankedTeams.map((roles) => {
        // Present on every matched role by construction; read off the first.
        const team = roles[0].role.team as NonNullable<CandidateJob['team']>;
        const focusAreas = [...new Set(team.teamFocusAreas.map((tfa) => tfa.ancestorArea.title))].sort((a, b) =>
          a.localeCompare(b)
        );
        const subFocusAreas = [...new Set(team.teamFocusAreas.map((tfa) => tfa.focusArea.title))].sort((a, b) =>
          a.localeCompare(b)
        );

        return {
          team: {
            uid: team.uid,
            name: team.name,
            logoUrl: team.logo?.url ?? null,
            focusAreas,
            subFocusAreas,
            jobReferEmail: team.jobReferEmail?.trim() || null,
            inAppApplyAvailable: isInAppApplyAvailable({
              teamUid: team.uid,
              name: team.name,
              jobReferEmail: team.jobReferEmail,
            }),
          },
          // The MATCHED count, not the team's whole board: this card lists only
          // matched roles, so "View all N" has to count the set it is the tail of.
          totalRoles: roles.length,
          roles: roles.map(({ role }) => ({
            uid: role.uid,
            roleTitle: role.roleTitle,
            roleCategory: role.roleCategory,
            seniority: role.seniority,
            location: role.location,
            workMode: role.workMode,
            applyUrl: role.sourceLink,
            descriptionHtml: role.descriptionHtml ?? null,
            lastUpdated: role.updatedAt.toISOString(),
            postedDate: role.postedDate ? role.postedDate.toISOString() : null,
            detectionDate: role.detectionDate.toISOString(),
            interestedCount: counts.get(role.uid) ?? 0,
            viewerIsInterested: viewerInterested.has(role.uid),
          })),
        };
      }),
    };
  }

  private async loadMember(viewerEmail?: string) {
    if (!viewerEmail) return null;
    const member = await this.prisma.member.findUnique({
      where: { email: viewerEmail },
      select: {
        uid: true,
        role: true,
        deletedAt: true,
        skills: { select: { title: true } },
        experiences: { select: { title: true } },
        teamMemberRoles: { select: { teamUid: true, role: true } },
      },
    });
    if (!member || member.deletedAt) return null;
    return member;
  }
}

const teamName = (matched: MatchedRole): string => matched.role.team?.name ?? '';

/**
 * Every non-hidden posting in the window, minus the member's own teams.
 *
 * A module function rather than a method so `CandidateJob` above can be derived
 * from its return type — a class's private members are not reachable through an
 * indexed access type.
 */
function loadCandidates(prisma: PrismaService, ownTeamUids: ReadonlySet<string>) {
  const and: Prisma.JobOpeningWhereInput[] = [];
  const dateWhere = buildJobOpeningDateWhere({ windowDays: FOR_YOU_WINDOW_DAYS });
  if (dateWhere) and.push(dateWhere);
  if (ownTeamUids.size > 0) and.push({ NOT: { teamUid: { in: [...ownTeamUids] } } });

  return prisma.jobOpening.findMany({
    where: {
      status: { notIn: HIDDEN_JOB_OPENING_STATUSES },
      teamUid: { not: null },
      ...(and.length > 0 ? { AND: and } : {}),
    },
    select: {
      uid: true,
      teamUid: true,
      roleTitle: true,
      roleCategory: true,
      department: true,
      seniority: true,
      location: true,
      workMode: true,
      sourceLink: true,
      descriptionHtml: true,
      postedDate: true,
      detectionDate: true,
      updatedAt: true,
      team: {
        select: {
          uid: true,
          name: true,
          jobReferEmail: true,
          logo: { select: { url: true } },
          teamFocusAreas: {
            select: {
              focusArea: { select: { title: true } },
              ancestorArea: { select: { title: true } },
            },
          },
        },
      },
    },
  });
}
