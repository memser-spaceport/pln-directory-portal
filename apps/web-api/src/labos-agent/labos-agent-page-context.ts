import { HttpException, NotFoundException } from '@nestjs/common';
import { TeamStatus } from '@prisma/client';
import { LABOS_AGENT_ERROR_CODES } from 'libs/contracts/src/schema/labos-agent';
import { JobOpeningsQueryService } from '../job-openings/job-openings-query.service';
import { newsRow } from '../mcp/mcp-news-tools';
import { PrismaService } from '../shared/prisma.service';
import { stripHtmlToPlainText } from '../team-news/team-news-body-html.util';
import { TeamNewsQueryService } from '../team-news/team-news-query.service';
import { TeamsService } from '../teams/teams.service';

/** S5 (LAB-3302, contract 9.4): the plain-text limits of the page text in the prompt context. */
export const MEMBER_BIO_MAX_CHARS = 1000;
export const JOB_DESCRIPTION_MAX_CHARS = 2000;

/** The S5 hint to read the own profile. The `profile` page and the `profile` mention use it. */
export const PROFILE_HINT =
  '"My profile" means the member\'s own profile. Call get_my_profile to read it before you answer about it.';
export const PROFILE_PAGE_SENTENCE = `The member is on their own LabOS profile. ${PROFILE_HINT}`;
export const MEMBER_PAGE_SENTENCE =
  'The member is on the LabOS page of this member. "This member" means this person. ' +
  'The member cannot change this profile.';
export const TEAM_PAGE_SENTENCE = 'The member is on the LabOS page of this team. "This team" means this team.';
export const JOB_PAGE_SENTENCE = 'The member is on this LabOS job post. "This job" means this role.';
export const JOB_BOARD_SENTENCE = 'The member is on the LabOS job board. Use getJobOpenings to find roles.';
export const NEWS_SOURCE_HINT = 'Call get_news_item with this uid for its source before you answer about it.';

/** S6 (LAB-3318, contract 10.6): the sentence before the mention lines. */
export const MENTIONS_SENTENCE =
  'The member added these LabOS items to the message. Each @name in the message means the item with that name. ' +
  'The member cannot change these items through you unless a tool allows it.';
/** S6 (contract 10.6): a turn with no context and no mentions. */
export const NO_PAGE_SENTENCE = 'The member added no LabOS page or item to this chat. Do not say that you read a page.';
export const HOME_MENTION_SENTENCE = 'The member points at the LabOS Home page.';

/** The S5 member row (contract 9.4). */
export type MemberPageRow = {
  uid: string;
  name: string;
  bio: string;
  teams: Array<{ uid: string; name: string; role: string | null }>;
  skills: string[];
};
/** The S5 team row (contract 9.4). */
export type TeamPageRow = { uid: string; name: string; shortDescription: string | null };
/** The S1 story row (contract section 2). */
export type NewsStoryRow = Pick<ReturnType<typeof newsRow>, 'uid' | 'title' | 'summary' | 'teamName' | 'eventDate'>;

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
export async function memberPageRow(prisma: PrismaService, uid: string): Promise<MemberPageRow> {
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
  return {
    uid: member.uid,
    name: member.name,
    bio: plainText(member.bio, MEMBER_BIO_MAX_CHARS),
    teams: member.teamMemberRoles.map((role) => ({ uid: role.team.uid, name: role.team.name, role: role.role })),
    skills: member.skills.map((skill) => skill.title),
  };
}

export async function memberPagePrompt(prisma: PrismaService, uid: string): Promise<string> {
  return withRow(MEMBER_PAGE_SENTENCE, 'Member', await memberPageRow(prisma, uid));
}

/**
 * `team` page: the rule of `GET /v1/teams/:uid` (`TeamsService.assertTeamVisibleToViewer`). Every case that hides the
 * page (unknown, deleted for a non-admin, L0 for a non-lead) gives 404 TEAM_NOT_FOUND, so the answer does not tell
 * that the team exists.
 */
export async function teamPageRow(
  teams: TeamsService,
  prisma: PrismaService,
  uid: string,
  email: string
): Promise<TeamPageRow> {
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
  return { uid: team.uid, name: team.name, shortDescription: team.shortDescription ?? null };
}

export async function teamPagePrompt(
  teams: TeamsService,
  prisma: PrismaService,
  uid: string,
  email: string
): Promise<string> {
  return withRow(TEAM_PAGE_SENTENCE, 'Team', await teamPageRow(teams, prisma, uid, email));
}

/**
 * A news story: the S1 rule (`getTeamNewsItemDto`), or 404 NEWS_NOT_FOUND. Only `uid`, `title`, `summary`, `teamName`
 * and `eventDate`.
 */
export async function newsStoryRow(
  teamNewsQuery: TeamNewsQueryService,
  uid: string,
  memberUid: string
): Promise<NewsStoryRow> {
  const item = await teamNewsQuery.getTeamNewsItemDto(uid, new Set(), memberUid);
  if (!item) throw notFound(LABOS_AGENT_ERROR_CODES.NEWS_NOT_FOUND, `News item not found: ${uid}`);
  const row = newsRow(item);
  return { uid: row.uid, title: row.title, summary: row.summary, teamName: row.teamName, eventDate: row.eventDate };
}

/** The S1 news story page text. It does not change in S6. */
export function newsStoryPrompt(story: NewsStoryRow): string {
  return (
    'The member is reading this LabOS news story. "This story" means this item. ' +
    `Call get_news_item with uid ${story.uid} for its source before you answer about it. Story: ${JSON.stringify(
      story
    )}`
  );
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
