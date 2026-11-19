import { HttpException, NotFoundException } from '@nestjs/common';
import { TeamStatus } from '@prisma/client';
import { LABOS_AGENT_ERROR_CODES } from 'libs/contracts/src/schema/labos-agent';
import { JobOpeningsQueryService } from '../job-openings/job-openings-query.service';
import { PrismaService } from '../shared/prisma.service';
import { stripHtmlToPlainText } from '../team-news/team-news-body-html.util';
import { TeamsService } from '../teams/teams.service';

/** S5 (LAB-3302, contract 9.4): the plain-text limits of the page text in the prompt context. */
export const MEMBER_BIO_MAX_CHARS = 1000;
export const JOB_DESCRIPTION_MAX_CHARS = 2000;

export const PROFILE_PAGE_SENTENCE =
  'The member is on their own LabOS profile. "My profile" means the member\'s own profile. ' +
  'Call get_my_profile to read it before you answer about it.';
export const MEMBER_PAGE_SENTENCE =
  'The member is on the LabOS page of this member. "This member" means this person. ' +
  'The member cannot change this profile.';
export const TEAM_PAGE_SENTENCE = 'The member is on the LabOS page of this team. "This team" means this team.';
export const JOB_PAGE_SENTENCE = 'The member is on this LabOS job post. "This job" means this role.';
export const JOB_BOARD_SENTENCE = 'The member is on the LabOS job board. Use getJobOpenings to find roles.';

function notFound(code: string, message: string) {
  return new NotFoundException({ statusCode: 404, code, message });
}

/** Plain text from HTML, cut to `max` characters. */
export function plainText(html: string | null | undefined, max: number): string {
  return stripHtmlToPlainText(html).slice(0, max);
}

/** The JSON of the row after the page sentence, as for the news story. */
function withRow(sentence: string, label: string, row: unknown): string {
  return `${sentence} ${label}: ${JSON.stringify(row)}`;
}

export function profilePrompt(memberUid: string): string {
  return withRow(PROFILE_PAGE_SENTENCE, 'Member', { uid: memberUid });
}

/**
 * `member` page: a live member (no `deletedAt`, the S3 member rule), or 404 MEMBER_NOT_FOUND. Only public fields:
 * no email, handles, Telegram, office hours or viewer-gated fields. Teams are current roles on teams that are not
 * deleted (INACTIVE).
 */
export async function memberPagePrompt(prisma: PrismaService, uid: string): Promise<string> {
  const now = new Date();
  const member = await prisma.member.findFirst({
    where: { uid, deletedAt: null },
    select: {
      uid: true,
      name: true,
      bio: true,
      skills: { select: { title: true } },
      teamMemberRoles: {
        where: {
          team: { status: { not: TeamStatus.INACTIVE } },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
        select: { role: true, team: { select: { uid: true, name: true } } },
      },
    },
  });
  if (!member) throw notFound(LABOS_AGENT_ERROR_CODES.MEMBER_NOT_FOUND, `Member not found: ${uid}`);
  const row = {
    uid: member.uid,
    name: member.name,
    bio: plainText(member.bio, MEMBER_BIO_MAX_CHARS),
    teams: member.teamMemberRoles.map((role) => ({ uid: role.team.uid, name: role.team.name, role: role.role })),
    skills: member.skills.map((skill) => skill.title),
  };
  return withRow(MEMBER_PAGE_SENTENCE, 'Member', row);
}

/**
 * `team` page: the rule of `GET /v1/teams/:uid` (`TeamsService.assertTeamVisibleToViewer`). Every case that hides the
 * page (unknown, deleted for a non-admin, L0 for a non-lead) gives 404 TEAM_NOT_FOUND, so the answer does not tell
 * that the team exists.
 */
export async function teamPagePrompt(
  teams: TeamsService,
  prisma: PrismaService,
  uid: string,
  email: string
): Promise<string> {
  try {
    await teams.assertTeamVisibleToViewer(uid, email);
  } catch (error) {
    const status = error instanceof HttpException ? error.getStatus() : 0;
    if (status === 403 || status === 404) {
      throw notFound(LABOS_AGENT_ERROR_CODES.TEAM_NOT_FOUND, `Team not found: ${uid}`);
    }
    throw error;
  }
  const team = await prisma.team.findUnique({
    where: { uid },
    select: { uid: true, name: true, shortDescription: true },
  });
  if (!team) throw notFound(LABOS_AGENT_ERROR_CODES.TEAM_NOT_FOUND, `Team not found: ${uid}`);
  return withRow(TEAM_PAGE_SENTENCE, 'Team', {
    uid: team.uid,
    name: team.name,
    shortDescription: team.shortDescription ?? null,
  });
}

/**
 * `job` page with `jobUid`: the rule of `GET /v1/job-openings/:uid` (`getJobOpening`), or 404 JOB_NOT_FOUND. Not
 * `jobReferEmail`, `interestedCount` or `viewerIsInterested`.
 */
export async function jobPagePrompt(jobs: JobOpeningsQueryService, uid: string, email: string): Promise<string> {
  let group: Awaited<ReturnType<JobOpeningsQueryService['getJobOpening']>>;
  try {
    group = await jobs.getJobOpening(uid, email);
  } catch (error) {
    if (error instanceof NotFoundException) {
      throw notFound(LABOS_AGENT_ERROR_CODES.JOB_NOT_FOUND, `Job not found: ${uid}`);
    }
    throw error;
  }
  const role = group.roles[0];
  const row = {
    uid: role.uid,
    roleTitle: role.roleTitle,
    team: { uid: group.team.uid, name: group.team.name },
    roleCategory: role.roleCategory,
    seniority: role.seniority,
    location: role.location,
    workMode: role.workMode,
    department: role.department,
    postedDate: role.postedDate,
    ...(role.pay ? { pay: role.pay } : {}),
    applyUrl: role.applyUrl,
    description: plainText(role.descriptionHtml, JOB_DESCRIPTION_MAX_CHARS),
  };
  return withRow(JOB_PAGE_SENTENCE, 'Job', row);
}
