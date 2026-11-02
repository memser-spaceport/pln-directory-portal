import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { CreateTeamNewsPostRequestSchema } from 'libs/contracts/src/schema/team-news';
import { ADMIN_PERMISSIONS, IRL_GATHERINGS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { MembersHooksService } from '../members/members.hooks.service';
import { MembersService } from '../members/members.service';
import {
  JOB_SEARCH_STATUS_WIRE,
  assignJobSearchStatusFromInput,
  toWireJobSearchStatus,
} from '../members/job-search-status';
import { PLEventGuestsService } from '../pl-events/pl-event-guests.service';
import { PLEventLocationsService } from '../pl-events/pl-event-locations.service';
import { ProjectsService } from '../projects/projects.service';
import { PrismaService } from '../shared/prisma.service';
import { TeamNewsQueryService } from '../team-news/team-news-query.service';
import { TeamNewsService } from '../team-news/team-news.service';
import { normalizeBlueskyHandler } from '../teams/team-handle-normalizer';
import { TeamsService } from '../teams/teams.service';
import { TeamEnrichmentService } from '../team-enrichment/team-enrichment.service';
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
  'blueskyHandler',
  'officeHours',
  'currentCompany',
  'teamOrProjectURL',
] as const;
const PROFILE_LOCATION_FIELDS = ['city', 'region', 'country'] as const;
const PROFILE_FIELDS = [
  ...PROFILE_TEXT_FIELDS,
  'name',
  'openToWork',
  'jobSearchStatus',
  'skills',
  'plnFriend',
  'plnStartDate',
  ...PROFILE_LOCATION_FIELDS,
] as const;
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
  blueskyHandler?: string | null;
  officeHours: string | null;
  openToWork: boolean | null;
  jobSearchStatus: Parameters<typeof toWireJobSearchStatus>[0];
  skills?: Array<{ title: string }>;
  currentCompany?: string | null;
  teamOrProjectURL?: string | null;
  plnFriend?: boolean | null;
  plnStartDate?: Date | null;
  location?: { city?: string | null; region?: string | null; country?: string | null } | null;
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
    blueskyHandler: member.blueskyHandler ?? null,
    officeHours: member.officeHours,
    openToWork: member.openToWork ?? false,
    jobSearchStatus: toWireJobSearchStatus(member.jobSearchStatus),
    skills: (member.skills ?? []).map((s) => s.title),
    currentCompany: member.currentCompany ?? null,
    teamOrProjectURL: member.teamOrProjectURL ?? null,
    plnFriend: member.plnFriend ?? false,
    plnStartDate: member.plnStartDate ? member.plnStartDate.toISOString().slice(0, 10) : null,
    city: member.location?.city ?? null,
    region: member.location?.region ?? null,
    country: member.location?.country ?? null,
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
        'Send only the fields to change; an empty string clears a text field. name cannot be cleared. skills replaces ' +
        'the whole list and takes existing LabOS skill titles. city, region and country set your location together. ' +
        'Join or leave teams and projects with join_team, leave_team, join_project and leave_project. Email and photo ' +
        'upload stay in LabOS. Delete a photo with delete_my_image.',
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
        blueskyHandler: z.string().optional(),
        currentCompany: z.string().optional(),
        teamOrProjectURL: z.string().optional(),
        name: z.string().optional(),
        openToWork: z.boolean().optional(),
        plnFriend: z.boolean().optional(),
        plnStartDate: z.string().optional().describe('ISO date, or empty to clear'),
        city: z.string().optional(),
        region: z.string().optional(),
        country: z.string().optional(),
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
          if (field === 'blueskyHandler') {
            data[field] = value.trim() === '' ? null : normalizeBlueskyHandler(value.trim()) ?? null;
          } else {
            data[field] = value.trim() === '' ? null : value.trim();
          }
        }
        if ('name' in args) {
          if (typeof args.name !== 'string' || args.name.trim() === '') {
            throw new BadRequestException('name must be non-empty text');
          }
          if (args.name.length > 200) throw new BadRequestException('name is too long');
          data.name = args.name.trim();
        }
        if ('openToWork' in args) {
          if (typeof args.openToWork !== 'boolean') throw new BadRequestException('openToWork must be true or false');
          data.openToWork = args.openToWork;
        }
        if ('plnFriend' in args) {
          if (typeof args.plnFriend !== 'boolean') throw new BadRequestException('plnFriend must be true or false');
          data.plnFriend = args.plnFriend;
        }
        if ('plnStartDate' in args) {
          if (args.plnStartDate === '') {
            data.plnStartDate = null;
          } else {
            const date = typeof args.plnStartDate === 'string' ? new Date(args.plnStartDate) : null;
            if (!date || Number.isNaN(date.getTime())) {
              throw new BadRequestException('plnStartDate must be a date like 2026-10-30');
            }
            data.plnStartDate = date;
          }
        }
        if (PROFILE_LOCATION_FIELDS.some((field) => field in args)) {
          for (const field of PROFILE_LOCATION_FIELDS) {
            if (field in args && typeof args[field] !== 'string') {
              throw new BadRequestException(`${field} must be text`);
            }
          }
          const existing = await members.findMemberByUid(ctx.memberUid);
          const stored = existing.location;
          const text = (field: typeof PROFILE_LOCATION_FIELDS[number], fallback: string | null | undefined) =>
            field in args ? String(args[field]).trim() : fallback ?? '';
          const locationPatch: Record<string, unknown> = {};
          await prisma.$transaction(async (tx) => {
            await members.mapLocationToMember(
              {
                city: text('city', stored?.city),
                region: text('region', stored?.region),
                country: text('country', stored?.country),
              },
              existing,
              locationPatch,
              tx
            );
          });
          if (locationPatch.location) data.location = locationPatch.location;
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
        const updatedFields = Object.keys(data).flatMap((key) =>
          key === 'location' ? PROFILE_LOCATION_FIELDS.filter((field) => field in args) : [key]
        );
        return { updated: updatedFields, profile: profileView(await members.findMemberByUid(ctx.memberUid)) };
      },
    },
  ];
}

function eventUidArg(args: Record<string, unknown>, allowed: string[]): string {
  const unknown = Object.keys(args).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new BadRequestException(`An agent can't set these on an RSVP: ${unknown.join(', ')}`);
  }
  const uid = typeof args.eventUid === 'string' ? args.eventUid.trim() : '';
  if (!uid) throw new BadRequestException('eventUid is required');
  return uid;
}

/**
 * `rsvp_event` and `cancel_event_rsvp` in the `events` scope (LAB-3029): the member's own "I'm going" for one upcoming
 * event, through the same guest service as the IRL gathering page. Nothing else on the guest record changes.
 */
export function eventWriteTools(
  guests: PLEventGuestsService,
  locations: PLEventLocationsService,
  members: MembersService,
  prisma: PrismaService
): McpToolDef[] {
  // The page's RSVP routes need the same permission (RbacGuard on the pl-events guest endpoints).
  const assertCanGo = (ctx: McpActorContext) => {
    if (
      !ctx.permissions.has(IRL_GATHERINGS_PERMISSIONS.GOING_WRITE) &&
      !ctx.permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL)
    ) {
      throw new ForbiddenException("Your LabOS account can't mark itself as going to events.");
    }
  };

  /** The event, its gathering, and whether the member is already a guest. Refuses events that have ended. */
  const upcomingEvent = async (ctx: McpActorContext, eventUid: string) => {
    const event = await prisma.pLEvent.findFirst({
      where: { uid: eventUid, isDeleted: false },
      select: { uid: true, name: true, type: true, slugURL: true, startDate: true, endDate: true, locationUid: true },
    });
    if (!event) throw new NotFoundException(`Event not found: ${eventUid}`);
    if (!event.locationUid) throw new BadRequestException(`${event.name} doesn't take RSVPs in LabOS`);
    // The gathering's `upcomingEvents` also holds events that ended in the last IRL_CURRENT_EVENT_WINDOW_IN_DAYS (90),
    // so check the end date itself.
    if (new Date(event.endDate).getTime() < Date.now()) {
      throw new BadRequestException(`${event.name} has already ended`);
    }
    const location = await locations.getPLEventLocationByUid(event.locationUid);
    if (!(location.upcomingEvents ?? []).some((upcoming) => upcoming.uid === event.uid)) {
      throw new BadRequestException(`${event.name} has already ended`);
    }
    const guest = await prisma.pLEventGuest.findFirst({
      where: { memberUid: ctx.memberUid, eventUid: event.uid, locationUid: event.locationUid },
      select: { uid: true },
    });
    const { locationUid, ...row } = event;
    return { event: row, locationUid, location, isGoing: guest !== null };
  };

  return [
    {
      name: 'rsvp_event',
      description:
        "Mark yourself as going to an upcoming Directory IRL event (the event page's I'm going). Other members see you " +
        'in the guest list. Uses your main team unless you name another of your teams. Calling it again when you are ' +
        'already going changes nothing. Get the event uid from search_events.',
      visibility: 'always',
      // Refuse topics, reason, dates and the rest instead of letting the SDK drop them and reporting success.
      keepUnknownArgs: true,
      inputSchema: {
        eventUid: z.string().describe('Event uid from search_events'),
        teamUid: z.string().optional().describe('One of your teams to show next to your name; default your main team'),
      },
      execute: async (ctx, args = {}) => {
        assertCanGo(ctx);
        const eventUid = eventUidArg(args, ['eventUid', 'teamUid']);
        const { event, locationUid, location, isGoing } = await upcomingEvent(ctx, eventUid);
        if (isGoing) return { going: true, alreadyGoing: true, event };
        // Members see an invite-only event only once they're a guest (filterEventsByAttendanceAndAdminStatus).
        if (event.type === 'INVITE_ONLY' && !ctx.permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL)) {
          throw new ForbiddenException(`${event.name} is invite-only; its organisers add guests`);
        }

        const member = await members.findMemberByUid(ctx.memberUid);
        const roles: Array<{ teamUid: string; mainTeam?: boolean | null }> = member.teamMemberRoles ?? [];
        const requested = typeof args.teamUid === 'string' ? args.teamUid.trim() : '';
        if (requested && !roles.some((role) => role.teamUid === requested)) {
          throw new BadRequestException(`You are not on team ${requested}`);
        }
        const teamUid = requested || (roles.find((role) => role.mainTeam) ?? roles[0])?.teamUid;
        if (!teamUid) throw new BadRequestException('You need to be on a team to RSVP to events');

        // Own telegram and office hours, so the service's "update if changed" leaves the member's profile alone.
        await guests.createPLEventGuestByLocation(
          {
            memberUid: member.uid,
            teamUid,
            telegramId: member.telegramHandler,
            officeHours: member.officeHours,
            events: [{ uid: event.uid }],
            additionalInfo: {},
          } as Parameters<PLEventGuestsService['createPLEventGuestByLocation']>[0],
          member,
          locationUid,
          ctx.email ?? member.email ?? '',
          location,
          'CREATE',
          undefined,
          'upcoming'
        );
        return { going: true, alreadyGoing: false, event };
      },
    },
    {
      name: 'cancel_event_rsvp',
      description:
        "Take yourself off the guest list of an upcoming Directory IRL event you said you'd go to. Only your own RSVP " +
        'changes. Calling it when you are not going changes nothing.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { eventUid: z.string().describe('Event uid from search_events') },
      execute: async (ctx, args = {}) => {
        assertCanGo(ctx);
        const eventUid = eventUidArg(args, ['eventUid']);
        const { event, locationUid, isGoing } = await upcomingEvent(ctx, eventUid);
        if (!isGoing) return { going: false, wasGoing: false, event };
        await guests.deletePLEventGuests(locationUid, [{ memberUid: ctx.memberUid, events: [event.uid] }]);
        return { going: false, wasGoing: true, event };
      },
    },
  ];
}

/** Team fields an agent may change (LAB-3030): text and links only. Name, logo, tags, roles stay in LabOS. */
const TEAM_FIELDS = [
  'shortDescription',
  'longDescription',
  'website',
  'blog',
  'contactMethod',
  'twitterHandler',
  'linkedinHandler',
  'telegramHandler',
  'blueskyHandler',
  'officeHours',
  'moreDetails',
] as const;
const PROJECT_TEXT_FIELDS = ['tagline', 'description', 'readMe'] as const;
const PROJECT_FIELDS = [...PROJECT_TEXT_FIELDS, 'lookingForFunding', 'tags', 'projectLinks'] as const;
const DIRECTORY_TEXT_MAX = 5000;
const PROJECT_LIST_MAX = 20;

export function refuseUnknown(args: Record<string, unknown>, allowed: readonly string[]) {
  const unknown = Object.keys(args).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new BadRequestException(`These fields can't be changed by an agent: ${unknown.join(', ')}`);
  }
}

export function requiredUid(args: Record<string, unknown>, key: string): string {
  const uid = typeof args[key] === 'string' ? (args[key] as string).trim() : '';
  if (!uid) throw new BadRequestException(`${key} is required`);
  return uid;
}

/** Trimmed text, or null for an empty string; refuses non-text and over-long values. */
function textField(field: string, value: unknown): string | null {
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be text`);
  if (value.length > DIRECTORY_TEXT_MAX) throw new BadRequestException(`${field} is too long`);
  return value.trim() === '' ? null : value.trim();
}

/**
 * `update_team` and `update_project` in the `directory` scope (LAB-3030). Same edit rights as the pages: team leads
 * (or directory admins) for a team; a member of the maintaining or a contributing team, the creator, or an admin for a
 * project. Only the listed fields change; everything else is refused by name.
 */
const TEAM_EXTRA_FIELDS = [
  'name',
  'dateFounded',
  'teamSize',
  'location',
  'locations',
  'fundingStage',
  'industryTags',
  'status',
] as const;

export function directoryWriteTools(
  teams: TeamsService,
  projects: ProjectsService,
  members: MembersService,
  prisma: PrismaService,
  enrichment?: Pick<TeamEnrichmentService, 'handleUserFieldChange'>
): McpToolDef[] {
  const isAdmin = (ctx: McpActorContext) => ctx.permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL);
  const roles = async (ctx: McpActorContext): Promise<Array<{ teamUid: string; teamLead?: boolean | null }>> =>
    (await members.findMemberByUid(ctx.memberUid)).teamMemberRoles ?? [];

  return [
    {
      name: 'update_team',
      description:
        `Update a team you lead in LabOS. Text fields: ${TEAM_FIELDS.join(', ')}. Also name, dateFounded (a year), ` +
        'teamSize, location, locations, fundingStage and industryTags (existing titles). Directory admins may set ' +
        'status to ACTIVE or INACTIVE. Logo, focus areas, members and membership sources stay on their own tools. ' +
        'Send only the fields to change; an empty string clears a text field.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        teamUid: z.string().describe('Team uid from search_teams; you must lead the team'),
        ...Object.fromEntries(TEAM_FIELDS.map((field) => [field, z.string().optional()])),
        name: z.string().optional(),
        dateFounded: z.number().int().nullable().optional(),
        teamSize: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        locations: z.array(z.string()).optional(),
        fundingStage: z.string().nullable().optional().describe('Existing funding stage title, or empty to clear'),
        industryTags: z.array(z.string()).optional().describe('Existing industry tag titles; replaces the list'),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional().describe('Directory admins only'),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['teamUid', ...TEAM_FIELDS, ...TEAM_EXTRA_FIELDS]);
        const teamUid = requiredUid(args, 'teamUid');
        const data: Record<string, unknown> = {};
        for (const field of TEAM_FIELDS) {
          if (field in args) data[field] = textField(field, args[field]);
        }
        if ('name' in args) {
          if (typeof args.name !== 'string' || args.name.trim() === '') {
            throw new BadRequestException('name must be non-empty text');
          }
          data.name = args.name.trim();
        }
        if ('dateFounded' in args) {
          if (args.dateFounded !== null && (typeof args.dateFounded !== 'number' || args.dateFounded < 1000)) {
            throw new BadRequestException('dateFounded must be a 4-digit year or null');
          }
          data.dateFounded = args.dateFounded;
        }
        if ('teamSize' in args) data.teamSize = args.teamSize === null ? null : textField('teamSize', args.teamSize);
        if ('location' in args) data.location = args.location === null ? null : textField('location', args.location);
        if ('locations' in args) {
          if (!Array.isArray(args.locations) || args.locations.some((item) => typeof item !== 'string')) {
            throw new BadRequestException('locations must be a list of text');
          }
          data.locations = args.locations.map((item) => String(item).trim()).filter(Boolean);
        }
        if ('status' in args) {
          if (!isAdmin(ctx)) throw new ForbiddenException('Only directory admins can change whether a team is active');
          data.status = args.status;
        }
        const admin = isAdmin(ctx);
        if (!admin && !(await roles(ctx)).some((role) => role.teamUid === teamUid && role.teamLead)) {
          throw new ForbiddenException('Only team leads can update a team');
        }
        const team = await prisma.team.findFirst({ where: { uid: teamUid }, select: { uid: true } });
        if (!team) throw new NotFoundException(`Team not found: ${teamUid}`);

        if ('fundingStage' in args) {
          if (args.fundingStage === null || args.fundingStage === '') {
            data.fundingStageUid = null;
          } else if (typeof args.fundingStage !== 'string') {
            throw new BadRequestException('fundingStage must be a title');
          } else {
            const stage = await prisma.fundingStage.findFirst({
              where: { title: { equals: args.fundingStage.trim(), mode: 'insensitive' } },
              select: { uid: true },
            });
            if (!stage) throw new BadRequestException(`Unknown funding stage: ${args.fundingStage}`);
            data.fundingStageUid = stage.uid;
          }
        }
        let industryTagUids: string[] | undefined;
        if ('industryTags' in args) {
          if (!Array.isArray(args.industryTags)) throw new BadRequestException('industryTags must be a list of titles');
          const titles = args.industryTags.map((title) => String(title).trim()).filter(Boolean);
          const found = await prisma.industryTag.findMany({
            where: { OR: titles.map((title) => ({ title: { equals: title, mode: 'insensitive' as const } })) },
            select: { uid: true, title: true },
          });
          const missing = titles.filter(
            (title) => !found.some((tag) => tag.title.toLowerCase() === title.toLowerCase())
          );
          if (missing.length > 0) throw new BadRequestException(`Unknown industry tags: ${missing.join(', ')}`);
          industryTagUids = found.map((tag) => tag.uid);
        }
        if (Object.keys(data).length === 0 && !industryTagUids) throw new BadRequestException('Nothing to update');

        const updated =
          Object.keys(data).length > 0
            ? await teams.updateTeamProfileFields(teamUid, data, ctx.email ?? '')
            : await prisma.team.findFirstOrThrow({ where: { uid: teamUid } });
        if (industryTagUids) {
          await prisma.team.update({
            where: { uid: teamUid },
            data: { industryTags: { set: industryTagUids.map((uid) => ({ uid })) } },
          });
        }
        const owned: Record<string, unknown> = {};
        if ('dateFounded' in data) owned.dateFounded = data.dateFounded;
        if (industryTagUids) owned.industryTags = industryTagUids;
        if (Object.keys(owned).length > 0) await enrichment?.handleUserFieldChange(teamUid, owned);
        const updatedNames = [
          ...Object.keys(data).map((key) => (key === 'fundingStageUid' ? 'fundingStage' : key)),
          ...(industryTagUids ? ['industryTags'] : []),
        ];
        return {
          updated: updatedNames,
          team: Object.fromEntries(['uid', 'name', ...TEAM_FIELDS].map((key) => [key, updated[key] ?? null])),
        };
      },
    },
    {
      name: 'update_project',
      description:
        `Update a LabOS project of one of your teams (or one you created). Only these fields can change: ` +
        `${PROJECT_FIELDS.join(', ')}. tags and projectLinks replace the whole list (up to ${PROJECT_LIST_MAX}); ` +
        'links need https://. Name, logo, teams, contributions and focus areas stay in LabOS. Read the current ' +
        'values with get_project first.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        projectUid: z.string().describe('Project uid from search_projects'),
        tagline: z.string().optional(),
        description: z.string().optional(),
        readMe: z.string().optional().describe('Markdown'),
        lookingForFunding: z.boolean().optional(),
        tags: z.array(z.string()).optional().describe('Replaces the list'),
        projectLinks: z
          .array(z.object({ name: z.string(), url: z.string() }))
          .optional()
          .describe('Replaces the list'),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['projectUid', ...PROJECT_FIELDS]);
        const projectUid = requiredUid(args, 'projectUid');
        const data: Record<string, unknown> = {};
        for (const field of PROJECT_TEXT_FIELDS) {
          if (!(field in args)) continue;
          const value = textField(field, args[field]);
          // tagline and description are required on a project; readMe may be cleared.
          if (value === null && field !== 'readMe') throw new BadRequestException(`${field} can't be empty`);
          data[field] = value;
        }
        if ('lookingForFunding' in args) {
          if (typeof args.lookingForFunding !== 'boolean') {
            throw new BadRequestException('lookingForFunding must be true or false');
          }
          data.lookingForFunding = args.lookingForFunding;
        }
        if ('tags' in args) {
          const tags = Array.isArray(args.tags)
            ? [...new Set(args.tags.map((t) => String(t).trim()).filter(Boolean))]
            : null;
          if (!tags || tags.length > PROJECT_LIST_MAX) {
            throw new BadRequestException(`tags must be a list of at most ${PROJECT_LIST_MAX}`);
          }
          data.tags = tags;
        }
        if ('projectLinks' in args) {
          const links = Array.isArray(args.projectLinks) ? args.projectLinks : null;
          if (!links || links.length > PROJECT_LIST_MAX) {
            throw new BadRequestException(`projectLinks must be a list of at most ${PROJECT_LIST_MAX}`);
          }
          data.projectLinks = links.map((link) => {
            const name = typeof link?.name === 'string' ? link.name.trim() : '';
            const url = typeof link?.url === 'string' ? link.url.trim() : '';
            if (!name || !/^https:\/\/\S+$/i.test(url)) {
              throw new BadRequestException('Each project link needs a name and an https:// url');
            }
            return { name, url };
          });
        }
        if (Object.keys(data).length === 0) throw new BadRequestException('Nothing to update');

        const project = await prisma.project.findFirst({
          where: { uid: projectUid, isDeleted: false },
          select: {
            uid: true,
            createdBy: true,
            maintainingTeamUid: true,
            contributingTeams: { select: { uid: true } },
          },
        });
        if (!project) throw new NotFoundException(`Project not found: ${projectUid}`);
        if (!isAdmin(ctx) && project.createdBy !== ctx.memberUid) {
          const projectTeams = [project.maintainingTeamUid, ...project.contributingTeams.map((team) => team.uid)];
          if (!(await roles(ctx)).some((role) => projectTeams.includes(role.teamUid))) {
            throw new ForbiddenException('You can only update projects of your teams or ones you created');
          }
        }

        const updated = await projects.updateProjectProfileFields(projectUid, data);
        return {
          updated: Object.keys(data),
          project: Object.fromEntries(['uid', 'name', ...PROJECT_FIELDS].map((key) => [key, updated?.[key] ?? null])),
        };
      },
    },
  ];
}

const MEMBERSHIP_TEXT_MAX = 200;

/** Optional trimmed text for a role or description; undefined when absent or empty. */
function optionalText(field: string, value: unknown, max = MEMBERSHIP_TEXT_MAX): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be text`);
  if (value.length > max) throw new BadRequestException(`${field} is too long`);
  return value.trim() || undefined;
}

function optionalDate(field: string, value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be a date like 2026-10-30`);
  return date;
}

type TeamRoleRow = { teamUid: string; role: string | null; mainTeam: boolean; teamLead: boolean };

async function myTeams(prisma: PrismaService, memberUid: string) {
  const roles = await prisma.teamMemberRole.findMany({
    where: { memberUid },
    select: { teamUid: true, role: true, mainTeam: true, teamLead: true, team: { select: { name: true } } },
    orderBy: { mainTeam: 'desc' },
  });
  return roles.map(({ team, ...role }) => ({ ...role, teamName: team?.name ?? null }));
}

async function myProjects(prisma: PrismaService, memberUid: string) {
  const contributions = await prisma.projectContribution.findMany({
    where: { memberUid, project: { isDeleted: false } },
    select: {
      projectUid: true,
      role: true,
      currentProject: true,
      startDate: true,
      endDate: true,
      project: { select: { name: true } },
    },
  });
  return contributions.map(({ project, ...row }) => ({ ...row, projectName: project?.name ?? null }));
}

/**
 * `join_team`, `leave_team`, `join_project` and `leave_project` in the `profile` scope (LAB-3057): the member's own
 * teams and project contributions, as on the profile page. The page sends the whole list to `PUT /v1/member/:uid`;
 * these send the current list plus or minus one entry through the same service steps, so nothing else changes.
 * There is no approval step, as in the UI; a new team role is never a lead.
 */
export function membershipTools(
  members: MembersService,
  hooks: MembersHooksService,
  prisma: PrismaService
): McpToolDef[] {
  /** Runs the page's team-role step with `next` as the full list, then the member post-update actions. */
  const saveTeams = async (ctx: McpActorContext, next: (current: TeamRoleRow[]) => TeamRoleRow[]) => {
    await prisma.$transaction(async (tx) => {
      const existing = await members.findMemberByUid(ctx.memberUid, tx);
      const teamAndRoles = next(
        existing.teamMemberRoles.map((role) => ({
          teamUid: role.teamUid,
          role: role.role,
          mainTeam: role.mainTeam,
          teamLead: role.teamLead,
        }))
      );
      await members.updateTeamMemberRoles({ teamAndRoles }, existing, ctx.memberUid, tx);
    });
    const updated = await members.findMemberByUid(ctx.memberUid);
    await hooks.postUpdateActions(updated, ctx.email ?? updated.email ?? '');
  };

  const saveContributions = async (
    ctx: McpActorContext,
    next: (current: Array<Record<string, unknown>>) => Array<Record<string, unknown>>
  ) => {
    await prisma.$transaction(async (tx) => {
      const existing = await members.findMemberByUid(ctx.memberUid, tx);
      const projectContributions = next(existing.projectContributions as unknown as Array<Record<string, unknown>>);
      await members.updateProjectContributions({ projectContributions }, existing, ctx.memberUid, tx);
    });
    const updated = await members.findMemberByUid(ctx.memberUid);
    await hooks.postUpdateActions(updated, ctx.email ?? updated.email ?? '');
  };

  return [
    {
      name: 'join_team',
      description:
        'Add yourself to a LabOS team, as on your profile page. The team shows on your profile and you show on the ' +
        'team page. You join as a member, not a lead. Set mainTeam to make it your main team. Calling it when you are ' +
        'already on the team changes nothing. Get the team uid from search_teams.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        teamUid: z.string().describe('Team uid from search_teams'),
        role: z.string().optional().describe('Your role on the team, e.g. "Engineer"'),
        mainTeam: z.boolean().optional().describe('Make this your main team'),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['teamUid', 'role', 'mainTeam']);
        const teamUid = requiredUid(args, 'teamUid');
        const role = optionalText('role', args.role) ?? null;
        if (args.mainTeam !== undefined && typeof args.mainTeam !== 'boolean') {
          throw new BadRequestException('mainTeam must be true or false');
        }
        const team = await prisma.team.findFirst({
          where: { uid: teamUid },
          select: { uid: true, name: true, status: true },
        });
        // The profile page offers active teams only.
        if (!team || team.status === 'INACTIVE') throw new NotFoundException(`Team not found: ${teamUid}`);

        const current = await myTeams(prisma, ctx.memberUid);
        if (current.some((row) => row.teamUid === teamUid)) {
          return { joined: false, alreadyOnTeam: true, team: { uid: team.uid, name: team.name }, teams: current };
        }
        const mainTeam = args.mainTeam === true || current.length === 0;
        await saveTeams(ctx, (rows) => [
          ...rows.map((row) => ({ ...row, mainTeam: mainTeam ? false : row.mainTeam })),
          { teamUid, role, mainTeam, teamLead: false },
        ]);
        return {
          joined: true,
          alreadyOnTeam: false,
          team: { uid: team.uid, name: team.name },
          teams: await myTeams(prisma, ctx.memberUid),
        };
      },
    },
    {
      name: 'leave_team',
      description:
        'Remove yourself from one of your LabOS teams, as on your profile page. You no longer show on the team page. ' +
        'If it was your main team, your first other team becomes main. If you are its only lead, the team is left ' +
        'without a lead, as in LabOS. Calling it when you are not on the team changes nothing.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { teamUid: z.string().describe('One of your teams (see get_member or join_team results)') },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['teamUid']);
        const teamUid = requiredUid(args, 'teamUid');
        const current = await myTeams(prisma, ctx.memberUid);
        const leaving = current.find((row) => row.teamUid === teamUid);
        if (!leaving) return { left: false, wasOnTeam: false, teams: current };
        await saveTeams(ctx, (rows) => rows.filter((row) => row.teamUid !== teamUid));
        return {
          left: true,
          wasOnTeam: true,
          team: { uid: teamUid, name: leaving.teamName },
          teams: await myTeams(prisma, ctx.memberUid),
        };
      },
    },
    {
      name: 'join_project',
      description:
        'Add a LabOS project to your contributions, as on your profile page. The project shows on your profile and ' +
        'you show as a contributor on the project page. Leave endDate out for a project you still work on. Calling it ' +
        'when you already have a current contribution to the project changes nothing. Get the project uid from ' +
        'search_projects.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        projectUid: z.string().describe('Project uid from search_projects'),
        role: z.string().optional().describe('Your role on the project'),
        description: z.string().optional().describe('What you did, a sentence or two'),
        startDate: z.string().optional().describe('ISO date; default today'),
        endDate: z.string().optional().describe('ISO date; leave out if you still work on it'),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['projectUid', 'role', 'description', 'startDate', 'endDate']);
        const projectUid = requiredUid(args, 'projectUid');
        const role = optionalText('role', args.role);
        const description = optionalText('description', args.description, 1000);
        const startDate = optionalDate('startDate', args.startDate) ?? new Date();
        const endDate = optionalDate('endDate', args.endDate);
        if (endDate && endDate.getTime() < startDate.getTime()) {
          throw new BadRequestException('endDate must be after startDate');
        }
        const project = await prisma.project.findFirst({
          where: { uid: projectUid, isDeleted: false },
          select: { uid: true, name: true },
        });
        if (!project) throw new NotFoundException(`Project not found: ${projectUid}`);

        const current = await myProjects(prisma, ctx.memberUid);
        if (current.some((row) => row.projectUid === projectUid && row.currentProject)) {
          return { joined: false, alreadyContributing: true, project, projects: current };
        }
        await saveContributions(ctx, (rows) => [
          ...rows,
          {
            projectUid,
            role: role ?? null,
            description: description ?? null,
            startDate,
            endDate: endDate ?? null,
            currentProject: !endDate,
          },
        ]);
        return {
          joined: true,
          alreadyContributing: false,
          project,
          projects: await myProjects(prisma, ctx.memberUid),
        };
      },
    },
    {
      name: 'leave_project',
      description:
        'Remove a project from your contributions, as on your profile page: every contribution you listed for it ' +
        'goes, and you no longer show as a contributor. Calling it when you have none changes nothing.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { projectUid: z.string().describe('A project you contribute to') },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['projectUid']);
        const projectUid = requiredUid(args, 'projectUid');
        const current = await myProjects(prisma, ctx.memberUid);
        const leaving = current.find((row) => row.projectUid === projectUid);
        if (!leaving) return { left: false, wasContributing: false, projects: current };
        await saveContributions(ctx, (rows) => rows.filter((row) => row.projectUid !== projectUid));
        return {
          left: true,
          wasContributing: true,
          project: { uid: projectUid, name: leaving.projectName },
          projects: await myProjects(prisma, ctx.memberUid),
        };
      },
    },
    {
      name: 'update_my_team_membership',
      description:
        'Change your role, main team, or investment-team flag on a team you already belong to. join_team does not ' +
        'change a team you are already on. You stay a member, not a lead. Setting investmentTeam true clears it on ' +
        'your other teams.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        teamUid: z.string().describe('A team you already belong to'),
        role: z.string().optional(),
        mainTeam: z.boolean().optional(),
        investmentTeam: z.boolean().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['teamUid', 'role', 'mainTeam', 'investmentTeam']);
        const teamUid = requiredUid(args, 'teamUid');
        if (!('role' in args) && !('mainTeam' in args) && !('investmentTeam' in args)) {
          throw new BadRequestException('Nothing to update');
        }
        const role = 'role' in args ? optionalText('role', args.role) ?? null : undefined;
        if ('mainTeam' in args && typeof args.mainTeam !== 'boolean') {
          throw new BadRequestException('mainTeam must be true or false');
        }
        if ('investmentTeam' in args && typeof args.investmentTeam !== 'boolean') {
          throw new BadRequestException('investmentTeam must be true or false');
        }
        const current = await myTeams(prisma, ctx.memberUid);
        const mine = current.find((row) => row.teamUid === teamUid);
        if (!mine) throw new NotFoundException(`You are not on team ${teamUid}. Use join_team first.`);
        if ('role' in args || 'mainTeam' in args) {
          const mainTeam = args.mainTeam === true;
          await saveTeams(ctx, (rows) =>
            rows.map((row) => {
              if (row.teamUid !== teamUid) {
                return { ...row, mainTeam: mainTeam ? false : row.mainTeam };
              }
              return {
                ...row,
                role: role === undefined ? row.role : role,
                mainTeam: 'mainTeam' in args ? mainTeam : row.mainTeam,
              };
            })
          );
        }
        if ('investmentTeam' in args) {
          await prisma.$transaction(async (tx) => {
            if (args.investmentTeam === true) {
              await tx.teamMemberRole.updateMany({
                where: { memberUid: ctx.memberUid, teamUid: { not: teamUid } },
                data: { investmentTeam: false },
              });
            }
            await tx.teamMemberRole.update({
              where: { memberUid_teamUid: { memberUid: ctx.memberUid, teamUid } },
              data: { investmentTeam: args.investmentTeam === true },
            });
          });
        }
        return { teamUid, teams: await myTeams(prisma, ctx.memberUid) };
      },
    },
    {
      name: 'update_my_project_contribution',
      description:
        'Change your role, description, or dates on a project you already contribute to. join_project does not change ' +
        'a current contribution. Leave endDate out to keep working on it; send an empty endDate to clear it.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        projectUid: z.string(),
        role: z.string().optional(),
        description: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional().describe('ISO date, or empty to clear'),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['projectUid', 'role', 'description', 'startDate', 'endDate']);
        const projectUid = requiredUid(args, 'projectUid');
        if (!['role', 'description', 'startDate', 'endDate'].some((field) => field in args)) {
          throw new BadRequestException('Nothing to update');
        }
        const row = await prisma.projectContribution.findFirst({
          where: { memberUid: ctx.memberUid, projectUid, project: { isDeleted: false } },
          orderBy: { currentProject: 'desc' },
        });
        if (!row) throw new NotFoundException(`You have no contribution to project ${projectUid}`);
        const data: Record<string, unknown> = {};
        if ('role' in args) data.role = optionalText('role', args.role) ?? null;
        if ('description' in args) data.description = optionalText('description', args.description, 1000) ?? null;
        if ('startDate' in args) data.startDate = optionalDate('startDate', args.startDate);
        if ('endDate' in args) {
          data.endDate = args.endDate === '' ? null : optionalDate('endDate', args.endDate);
          data.currentProject = data.endDate == null;
        }
        await prisma.projectContribution.update({ where: { uid: row.uid }, data });
        return { projectUid, contributionUid: row.uid, projects: await myProjects(prisma, ctx.memberUid) };
      },
    },
  ];
}
