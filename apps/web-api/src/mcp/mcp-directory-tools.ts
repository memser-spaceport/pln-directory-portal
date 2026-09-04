import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { ProjectsService } from '../projects/projects.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { SearchService } from '../search/search.service';
import {
  canViewJobSearchStatus,
  compactEventRow,
  compactForumThreadRow,
  compactMemberRow,
  compactProjectRow,
  compactTeamRow,
  formatMemberForViewer,
  formatProjectForViewer,
  formatTeamForViewer,
} from './mcp-directory-viewer';
import { McpToolDef } from './mcp-tools';

const DIRECTORY_SEARCH_LIMIT_MAX = 50;
const DIRECTORY_SEARCH_LIMIT_DEFAULT = 20;

function clampLimit(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return DIRECTORY_SEARCH_LIMIT_DEFAULT;
  return Math.min(Math.max(Math.trunc(num), 1), DIRECTORY_SEARCH_LIMIT_MAX);
}

function stringArg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

const searchInputSchema = {
  q: z.string().min(1).describe('Search text'),
  limit: z.number().int().min(1).max(DIRECTORY_SEARCH_LIMIT_MAX).optional().describe('Max rows (default 20, max 50)'),
};

const getByUidInputSchema = (description: string) => ({
  uid: z.string().min(1).describe(description),
});

export function directoryTools(
  members: MembersService,
  teams: TeamsService,
  projects: ProjectsService,
  events: PLEventsService,
  search: SearchService
): McpToolDef[] {
  return [
    {
      name: 'search_members',
      description:
        'Search Directory members by name (also matches team name). Returns compact rows only (uid, name, image, mainTeam, location). Then call get_member with a uid for the full profile.',
      visibility: 'always',
      inputSchema: searchInputSchema,
      execute: async (_ctx, args = {}) => {
        const limit = clampLimit(args.limit);
        const result = await members.searchMembers({ search: stringArg(args.q), limit });
        return {
          results: (result.members ?? []).map((member) => compactMemberRow(member as Record<string, unknown>)),
          limit,
        };
      },
    },
    {
      name: 'get_member',
      description:
        'Fetch one Directory member by uid with the full profile, same as the Directory member page for the connected member. Search first with search_members to get a uid.',
      visibility: 'always',
      inputSchema: getByUidInputSchema('Member uid from search_members'),
      execute: async (ctx, args = {}) => {
        const uid = stringArg(args.uid) ?? '';
        const member = await members.findOne(uid, {});
        const canSeeJobSearchStatus = await canViewJobSearchStatus(members, ctx, member.uid);
        return formatMemberForViewer(member as unknown as Record<string, unknown>, canSeeJobSearchStatus);
      },
    },
    {
      name: 'search_teams',
      description:
        'Search Directory teams by name. Returns compact rows only (uid, name, image, shortDescription). Then call get_team with a uid for the full team page.',
      visibility: 'always',
      inputSchema: searchInputSchema,
      execute: async (_ctx, args = {}) => {
        const limit = clampLimit(args.limit);
        const result = await teams.searchTeams({ searchBy: stringArg(args.q), limit });
        return {
          results: (result.teams ?? []).map((team) => compactTeamRow(team as Record<string, unknown>)),
          limit,
        };
      },
    },
    {
      name: 'get_team',
      description:
        'Fetch one Directory team by uid with the full team page. Restricted teams are only visible to their own members or Directory admins. Search first with search_teams to get a uid.',
      visibility: 'always',
      inputSchema: getByUidInputSchema('Team uid from search_teams'),
      execute: async (ctx, args = {}) => {
        const uid = stringArg(args.uid) ?? '';
        const team = await teams.findTeamByUid(uid, ctx.email ?? undefined);
        return formatTeamForViewer(team as unknown as Record<string, unknown>);
      },
    },
    {
      name: 'search_projects',
      description:
        'Search Directory projects by name. Returns compact rows only (uid, name, image, tagline). Then call get_project with a uid for the full project page.',
      visibility: 'always',
      inputSchema: searchInputSchema,
      execute: async (_ctx, args = {}) => {
        const limit = clampLimit(args.limit);
        const result = await projects.searchProjects({ search: stringArg(args.q), limit });
        return {
          results: (result.projects ?? []).map((project) => compactProjectRow(project as Record<string, unknown>)),
          limit,
        };
      },
    },
    {
      name: 'get_project',
      description:
        'Fetch one Directory project by uid with the full project page. Search first with search_projects to get a uid.',
      visibility: 'always',
      inputSchema: getByUidInputSchema('Project uid from search_projects'),
      execute: async (_ctx, args = {}) => {
        const uid = stringArg(args.uid) ?? '';
        const project = await projects.getProjectByUid(uid);
        if (!project || (project as Record<string, unknown>).isDeleted) {
          throw new NotFoundException(`Project not found with uid: ${uid}.`);
        }
        return formatProjectForViewer(project as unknown as Record<string, unknown>);
      },
    },
    {
      name: 'search_events',
      description:
        'Search Directory IRL events by name, description, or location. Returns compact rows only (uid, name, image, slugURL, startDate, endDate, location). Then call get_event with a uid for the full event page.',
      visibility: 'always',
      inputSchema: searchInputSchema,
      execute: async (_ctx, args = {}) => {
        const limit = clampLimit(args.limit);
        const result = await events.searchPLEvents({ search: stringArg(args.q), limit });
        return {
          results: (result.events ?? []).map((event) => compactEventRow(event as Record<string, unknown>)),
          limit,
        };
      },
    },
    {
      name: 'get_event',
      description:
        'Fetch one Directory IRL event by uid with the full event page, including guests. Search first with search_events to get a uid.',
      visibility: 'always',
      inputSchema: getByUidInputSchema('Event uid from search_events'),
      execute: async (_ctx, args = {}) => {
        const uid = stringArg(args.uid) ?? '';
        const event = await events.getPLEventForViewer(uid, { isUserLoggedIn: true });
        return event as unknown as Record<string, unknown>;
      },
    },
    {
      name: 'search_forum_threads',
      description:
        'Search forum threads by text matched against thread titles and post content. Returns compact rows only (uid, topicTitle, topicSlug, topicUrl, replyCount, cid, snippet). Requires forum.read. Then call get_forum_thread with a uid for the full thread.',
      visibility: 'forum',
      inputSchema: searchInputSchema,
      execute: async (_ctx, args = {}) => {
        const limit = clampLimit(args.limit);
        const q = stringArg(args.q) ?? '';
        const hits = await search.searchForumPosts(q, limit);
        return {
          results: hits.map((hit) => compactForumThreadRow(hit as Record<string, unknown>)),
          limit,
        };
      },
    },
    {
      name: 'get_forum_thread',
      description:
        'Fetch one forum thread by uid (tid) with the full thread, including the root post and replies. Requires forum.read. Search first with search_forum_threads to get a uid.',
      visibility: 'forum',
      inputSchema: getByUidInputSchema('Forum thread uid (tid) from search_forum_threads'),
      execute: async (_ctx, args = {}) => {
        const uid = stringArg(args.uid) ?? '';
        const thread = await search.getForumThreadByUid(uid);
        if (!thread) {
          throw new NotFoundException(`Forum thread not found: ${uid}`);
        }
        return thread as Record<string, unknown>;
      },
    },
  ];
}
