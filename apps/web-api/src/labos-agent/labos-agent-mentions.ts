import { Prisma, TeamStatus } from '@prisma/client';
import {
  LabosAgentMentionMember,
  LabosAgentMentionNews,
  LabosAgentMentionsQuery,
  LabosAgentMentionsResponse,
  LabosAgentMentionTeam,
} from 'libs/contracts/src/schema/labos-agent';
import { MEMBER_PERMISSIONS, TEAM_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { searchRelevanceScore } from '../members/member-search-relevance';
import { directoryListedMemberWhere } from '../members/member-visibility';
import { PrismaService } from '../shared/prisma.service';
import { TEAM_NEWS_EXCLUDED_TEAM_NAMES } from '../team-news/team-news-public-list.config';
import { PUBLICLY_VISIBLE_TEAM_WHERE } from '../teams/team-public-visibility';

/** C4 (LAB-3318, contract 10.2.1): the backend reads at most this many rows for each type before it ranks. */
export const MENTION_SEARCH_MAX_ROWS = 200;
/** C4 team rows cut `shortDescription` to this length. */
export const MENTION_TEAM_DESCRIPTION_MAX_CHARS = 140;
/** The tier of a news item that matches only on the team name. */
const TEAM_NAME_TIER = 20;

/** Teams that C4 lists: not deleted (INACTIVE) and not L0. Also for a directory admin. */
const LISTED_TEAM_WHERE: Prisma.TeamWhereInput = {
  AND: [{ status: { not: TeamStatus.INACTIVE } }, PUBLICLY_VISIBLE_TEAM_WHERE],
};

/** The feed rule (`TeamNewsQueryService.excludedTeamsWhere`): no item of an excluded team. */
const FEED_NEWS_WHERE: Prisma.TeamNewsItemWhereInput = {
  NOT: {
    OR: TEAM_NEWS_EXCLUDED_TEAM_NAMES.map((name) => ({ team: { name: { equals: name, mode: 'insensitive' } } })),
  },
};

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });

/** A current role: no `endDate`, or `endDate` today or later. */
function currentRoleWhere(now: Date): Prisma.TeamMemberRoleWhereInput {
  return { OR: [{ endDate: null }, { endDate: { gte: now } }], team: LISTED_TEAM_WHERE };
}

/**
 * C4 search: members, teams and news for the mention picker. A database search only; it calls no model, writes nothing
 * and sends no notification. `permissions` are the member's effective RBAC permissions (contract 10.2.2).
 */
export async function searchMentions(
  prisma: PrismaService,
  memberUid: string,
  permissions: Set<string>,
  query: LabosAgentMentionsQuery
): Promise<LabosAgentMentionsResponse> {
  const { q, types, limit } = query;
  const now = new Date();
  const wantMembers = types.includes('member') && permissions.has(MEMBER_PERMISSIONS.SEARCH_READ);
  const wantTeams = types.includes('team') && permissions.has(TEAM_PERMISSIONS.SEARCH_READ);
  const wantNews = types.includes('news');
  const [members, teams, news] = await Promise.all([
    wantMembers && q ? searchMembers(prisma, memberUid, q, limit, now) : Promise.resolve([]),
    wantTeams ? (q ? searchTeams(prisma, q, limit) : myTeams(prisma, memberUid, limit, now)) : Promise.resolve([]),
    wantNews ? searchNews(prisma, q, limit) : Promise.resolve([]),
  ]);
  return { q, members, teams, news };
}

/** Sort by score high to low, then by the tie rule. `Array.prototype.sort` is stable. */
function rank<T>(rows: T[], score: (row: T) => number, tie: (a: T, b: T) => number): T[] {
  return rows
    .map((row) => ({ row, score: score(row) }))
    .sort((a, b) => b.score - a.score || tie(a.row, b.row))
    .map((item) => item.row);
}

function byName<T extends { name: string | null }>(a: T, b: T): number {
  return (a.name || '').localeCompare(b.name || '');
}

/**
 * Members: directory members (approved) with no `deletedAt`, never the session member. Match: the name, or the name of
 * a current team that C4 lists. Rank: the LAB-1277 tiers on `name` with the team tier. Tie: name A to Z.
 */
async function searchMembers(
  prisma: PrismaService,
  memberUid: string,
  q: string,
  limit: number,
  now: Date
): Promise<LabosAgentMentionMember[]> {
  const roles = currentRoleWhere(now);
  const rows = await prisma.member.findMany({
    where: {
      AND: [
        directoryListedMemberWhere(),
        { deletedAt: null },
        { uid: { not: memberUid } },
        {
          OR: [
            { name: contains(q) },
            { teamMemberRoles: { some: { ...roles, team: { AND: [LISTED_TEAM_WHERE, { name: contains(q) }] } } } },
          ],
        },
      ],
    },
    orderBy: { name: 'asc' },
    take: MENTION_SEARCH_MAX_ROWS,
    select: {
      uid: true,
      name: true,
      image: { select: { url: true } },
      teamMemberRoles: {
        where: roles,
        select: { role: true, mainTeam: true, team: { select: { name: true } } },
      },
    },
  });
  return rank(
    rows,
    (row) =>
      searchRelevanceScore(
        row.name,
        q,
        row.teamMemberRoles.map((item) => item.team?.name)
      ),
    byName
  )
    .slice(0, limit)
    .map((row) => {
      const main = row.teamMemberRoles.find((item) => item.mainTeam) ?? row.teamMemberRoles[0];
      return {
        type: 'member',
        uid: row.uid,
        name: row.name,
        imageUrl: row.image?.url ?? null,
        teamName: main?.team?.name ?? null,
        role: main?.role ?? null,
      };
    });
}

type TeamRow = { uid: string; name: string; logo: { url: string } | null; shortDescription: string | null };
const TEAM_SELECT = { uid: true, name: true, logo: { select: { url: true } }, shortDescription: true } as const;

function teamItem(row: TeamRow): LabosAgentMentionTeam {
  return {
    type: 'team',
    uid: row.uid,
    name: row.name,
    logoUrl: row.logo?.url ?? null,
    shortDescription: row.shortDescription ? row.shortDescription.slice(0, MENTION_TEAM_DESCRIPTION_MAX_CHARS) : null,
  };
}

/** Teams: not INACTIVE and not L0. Match: the name. Rank: the tiers on `name`, no team tier. Tie: name A to Z. */
async function searchTeams(prisma: PrismaService, q: string, limit: number): Promise<LabosAgentMentionTeam[]> {
  const rows: TeamRow[] = await prisma.team.findMany({
    where: { AND: [LISTED_TEAM_WHERE, { name: contains(q) }] },
    orderBy: { name: 'asc' },
    take: MENTION_SEARCH_MAX_ROWS,
    select: TEAM_SELECT,
  });
  return rank(rows, (row) => searchRelevanceScore(row.name, q), byName)
    .slice(0, limit)
    .map(teamItem);
}

/** Default list (contract 10.2.3): the session member's current teams that C4 lists. Main team first, then A to Z. */
async function myTeams(
  prisma: PrismaService,
  memberUid: string,
  limit: number,
  now: Date
): Promise<LabosAgentMentionTeam[]> {
  const roles = await prisma.teamMemberRole.findMany({
    where: { memberUid, ...currentRoleWhere(now) },
    select: { mainTeam: true, team: { select: TEAM_SELECT } },
  });
  return roles
    .filter((role) => !!role.team)
    .sort((a, b) => Number(b.mainTeam) - Number(a.mainTeam) || byName(a.team, b.team))
    .slice(0, limit)
    .map((role) => teamItem(role.team));
}

type NewsRow = {
  uid: string;
  title: string;
  eventDate: Date;
  createdAt: Date;
  team: { uid: string; name: string } | null;
};

const newestFirst = (a: NewsRow, b: NewsRow) =>
  b.eventDate.getTime() - a.eventDate.getTime() || b.createdAt.getTime() - a.createdAt.getTime();

/**
 * News: the feed rule. Match: the title or the team name. Rank: the tiers on `title`; a team name match only is tier
 * 20. Tie: `eventDate` new to old, then `createdAt` new to old. Empty `q`: the newest items.
 */
async function searchNews(prisma: PrismaService, q: string, limit: number): Promise<LabosAgentMentionNews[]> {
  const rows: NewsRow[] = await prisma.teamNewsItem.findMany({
    where: q
      ? { AND: [FEED_NEWS_WHERE, { OR: [{ title: contains(q) }, { team: { name: contains(q) } }] }] }
      : FEED_NEWS_WHERE,
    orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
    take: q ? MENTION_SEARCH_MAX_ROWS : limit,
    select: { uid: true, title: true, eventDate: true, createdAt: true, team: { select: { uid: true, name: true } } },
  });
  const ranked = q ? rank(rows, (row) => searchRelevanceScore(row.title, q) || TEAM_NAME_TIER, newestFirst) : rows;
  return ranked.slice(0, limit).map((row) => ({
    type: 'news',
    uid: row.uid,
    title: row.title,
    teamUid: row.team?.uid ?? '',
    teamName: row.team?.name ?? '',
    eventDate: row.eventDate.toISOString(),
  }));
}
