import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { CreateTeamNewsPostRequestSchema } from 'libs/contracts/src/schema/team-news';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { MembersHooksService } from '../members/members.hooks.service';
import { MembersService } from '../members/members.service';
import {
  JOB_SEARCH_STATUS_WIRE,
  assignJobSearchStatusFromInput,
  toWireJobSearchStatus,
} from '../members/job-search-status';
import { PrismaService } from '../shared/prisma.service';
import { TeamNewsQueryService } from '../team-news/team-news-query.service';
import { TeamNewsService } from '../team-news/team-news.service';
import { newsRow } from './mcp-news-tools';
import { McpActorContext, McpToolDef } from './mcp-tools';

/** Profile fields an agent may change (LAB-3020). Anything else is rejected, never passed to Prisma. */
const PROFILE_TEXT_FIELDS = [
  'bio',
  'moreDetails',
  'githubHandler',
  'telegramHandler',
  'linkedinHandler',
  'twitterHandler',
  'discordHandler',
  'officeHours',
] as const;
const PROFILE_FIELDS = [...PROFILE_TEXT_FIELDS, 'openToWork', 'jobSearchStatus', 'skills'] as const;
const PROFILE_TEXT_MAX = 2000;
const SKILLS_MAX = 30;

async function requestor(members: MembersService, ctx: McpActorContext) {
  const member = await members.findMemberByUid(ctx.memberUid);
  return {
    uid: member.uid,
    isDirectoryAdmin: ctx.permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL),
    teamMemberRoles: member.teamMemberRoles,
  };
}

/** `post_team_news`: posts team news as the member, with the same checks as the team page (LAB-3020). */
export function newsWriteTools(
  news: TeamNewsService,
  newsQuery: TeamNewsQueryService,
  members: MembersService
): McpToolDef[] {
  return [
    {
      name: 'post_team_news',
      description:
        'Post a news item for one of your teams (a launch, raise, partnership or milestone). Needs a link to the source. ' +
        'Only members of the team (or directory admins) can post; the same link cannot be posted twice for a team. ' +
        'Other members see it in the LabOS news feed.',
      visibility: 'always',
      inputSchema: {
        teamUid: z.string().describe('Team to post for; must be one of your teams'),
        title: z.string().describe('Headline, up to 150 characters'),
        url: z.string().describe('Full https:// link to the source'),
        body: z.string().optional().describe('Optional details (plain text or simple HTML)'),
      },
      execute: async (ctx, args = {}) => {
        const teamUid = typeof args.teamUid === 'string' ? args.teamUid.trim() : '';
        if (!teamUid) throw new BadRequestException('teamUid is required');
        const parsed = CreateTeamNewsPostRequestSchema.safeParse({ title: args.title, url: args.url, body: args.body });
        if (!parsed.success) {
          throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
        }
        const { uid } = await news.createTeamPostedNews(teamUid, parsed.data, await requestor(members, ctx));
        const item = await newsQuery.getTeamNewsItemDto(uid, new Set(), ctx.memberUid);
        if (!item) throw new NotFoundException(`News item ${uid} not found after posting`);
        return { posted: newsRow(item) };
      },
    },
  ];
}

function profileView(member: {
  uid: string;
  name: string;
  bio: string | null;
  moreDetails: string | null;
  githubHandler: string | null;
  telegramHandler: string | null;
  linkedinHandler: string | null;
  twitterHandler: string | null;
  discordHandler: string | null;
  officeHours: string | null;
  openToWork: boolean | null;
  jobSearchStatus: Parameters<typeof toWireJobSearchStatus>[0];
  skills?: Array<{ title: string }>;
}) {
  return {
    uid: member.uid,
    name: member.name,
    bio: member.bio,
    moreDetails: member.moreDetails,
    githubHandler: member.githubHandler,
    telegramHandler: member.telegramHandler,
    linkedinHandler: member.linkedinHandler,
    twitterHandler: member.twitterHandler,
    discordHandler: member.discordHandler,
    officeHours: member.officeHours,
    openToWork: member.openToWork ?? false,
    jobSearchStatus: toWireJobSearchStatus(member.jobSearchStatus),
    skills: (member.skills ?? []).map((s) => s.title),
  };
}

/** `get_my_profile` (read) and `update_my_profile` (write) in the `profile` scope (LAB-3020). */
export function profileTools(members: MembersService, hooks: MembersHooksService, prisma: PrismaService): McpToolDef[] {
  return [
    {
      name: 'get_my_profile',
      description: `Read your own LabOS profile: the fields update_my_profile can change (${PROFILE_FIELDS.join(
        ', '
      )}).`,
      visibility: 'always',
      execute: async (ctx) => profileView(await members.findMemberByUid(ctx.memberUid)),
    },
    {
      name: 'update_my_profile',
      description:
        `Update your own LabOS profile. Only these fields can change: ${PROFILE_FIELDS.join(', ')}. ` +
        'Send only the fields to change; an empty string clears a text field. skills replaces the whole list and ' +
        'takes existing LabOS skill titles. Name, email, teams, roles and photo stay in LabOS.',
      visibility: 'always',
      // Without it the SDK drops `email` and friends silently, and the rest of the call saves as if they were never
      // sent; with it the call is refused and names them.
      keepUnknownArgs: true,
      inputSchema: {
        bio: z.string().optional(),
        moreDetails: z.string().optional(),
        githubHandler: z.string().optional(),
        telegramHandler: z.string().optional(),
        linkedinHandler: z.string().optional(),
        twitterHandler: z.string().optional(),
        discordHandler: z.string().optional(),
        officeHours: z.string().optional().describe('Booking link'),
        openToWork: z.boolean().optional(),
        jobSearchStatus: z.enum(JOB_SEARCH_STATUS_WIRE).optional(),
        skills: z.array(z.string()).optional().describe('Existing LabOS skill titles; replaces the list'),
      },
      execute: async (ctx, args = {}) => {
        const unknown = Object.keys(args).filter((k) => !(PROFILE_FIELDS as readonly string[]).includes(k));
        if (unknown.length > 0) {
          throw new BadRequestException(`These fields can't be changed by an agent: ${unknown.join(', ')}`);
        }
        const data: Record<string, unknown> = {};
        for (const field of PROFILE_TEXT_FIELDS) {
          if (!(field in args)) continue;
          const value = args[field];
          if (typeof value !== 'string') throw new BadRequestException(`${field} must be text`);
          if (value.length > PROFILE_TEXT_MAX) throw new BadRequestException(`${field} is too long`);
          data[field] = value.trim() === '' ? null : value.trim();
        }
        if ('openToWork' in args) {
          if (typeof args.openToWork !== 'boolean') throw new BadRequestException('openToWork must be true or false');
          data.openToWork = args.openToWork;
        }
        assignJobSearchStatusFromInput(args, data);
        if ('skills' in args) {
          const titles = Array.isArray(args.skills) ? args.skills.map((t) => String(t).trim()).filter(Boolean) : null;
          if (!titles || titles.length > SKILLS_MAX) {
            throw new BadRequestException(`skills must be a list of at most ${SKILLS_MAX} titles`);
          }
          const found = await prisma.skill.findMany({
            where: { OR: titles.map((title) => ({ title: { equals: title, mode: 'insensitive' as const } })) },
            select: { uid: true, title: true },
          });
          const missing = titles.filter((t) => !found.some((s) => s.title.toLowerCase() === t.toLowerCase()));
          if (missing.length > 0) {
            throw new BadRequestException(`Unknown skills: ${missing.join(', ')}. Use existing LabOS skill titles.`);
          }
          data.skills = { set: found.map((s) => ({ uid: s.uid })) };
        }
        if (Object.keys(data).length === 0) {
          throw new BadRequestException('Nothing to update');
        }

        const updated = await members.updateMemberByUid(ctx.memberUid, data as Prisma.MemberUncheckedUpdateInput);
        await hooks.postUpdateActions(updated, ctx.email ?? updated.email ?? '');
        return { updated: Object.keys(data), profile: profileView(await members.findMemberByUid(ctx.memberUid)) };
      },
    },
  ];
}
