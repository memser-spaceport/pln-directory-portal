import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import pLimit from 'p-limit';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { PLEventGuestsService } from '../../pl-events/pl-event-guests.service';
import { MembersService } from '../../members/members.service';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';
import { HuskyAuthContext } from './husky-auth-context';
import { fuzzyMatches, longestWord, textMentions } from './fuzzy-match.util';

const MAX_EVENTS = 10;
/**
 * Attendees come from the same paginated service the IRL Gatherings page uses; one page this
 * size covers all but the largest gatherings, and the output says so when it does not.
 */
const ATTENDEE_FETCH_LIMIT = 300;
const MAX_ATTENDEES_SHOWN = 40;
/**
 * Each event's attendee lookup is a heavy multi-join query over every guest at its location;
 * running all ten at once would monopolise the connection pool for every other request.
 */
const ATTENDEE_FETCH_CONCURRENCY = 3;
/**
 * Words a model tends to append to an event name ("Rohan LLC event", "Climate Week gathering")
 * that are almost never part of the stored name, so a literal contains-match on the whole
 * phrase finds nothing.
 */
const EVENT_FILLER_WORDS = new Set(['event', 'events', 'gathering', 'gatherings', 'meetup', 'conference', 'summit']);

const IrlEventsToolParams = z.object({
  location: z.string().describe('The location (gathering city) to search for').optional(),
  timeframe: z
    .enum(['upcoming', 'past'])
    .describe(
      "'upcoming' for current and future events (use this for who-is-going / who-will-attend questions), 'past' for events that already ended. Omit to search both, upcoming first."
    )
    .optional(),
  fromDate: z.string().describe('The optional start date to search for, format YYYY-MM-DD').optional(),
  toDate: z.string().describe('The optional end date to search for, format YYYY-MM-DD').optional(),
  search: z
    .string()
    .describe(
      'The event or gathering to look for (e.g. "Climate Week NYC"), matched against event name, description, or location. A short name works best; do not append words like "event".'
    )
    .optional(),
  guestName: z
    .string()
    .describe(
      'Optional member or team name to look for among the attendees. Not for the event name — use search for that.'
    )
    .optional(),
  attendeeTopic: z
    .string()
    .describe(
      'Optional topic or focus area (e.g. "storage", "AI", "public goods") to narrow the attendee list to people from teams working on it, or who listed it as a topic of interest'
    )
    .optional(),
  orderBy: z.enum(['date', 'name', 'priority']).describe('Sort events by start date, name, or priority').optional(),
});

type IrlEventsToolArgs = z.infer<typeof IrlEventsToolParams>;

/**
 * The signed-in member as the IRL Gatherings page sees it: `MembersService.findMemberByEmail`
 * also resolves RBAC permissions, which the page's admin check reads alongside member roles.
 */
type ViewerMember = NonNullable<Awaited<ReturnType<MembersService['findMemberByEmail']>>>;
type LoadViewer = () => Promise<ViewerMember | null>;

type EventRow = Prisma.PLEventGetPayload<{ include: { location: true } }>;

/** One row of `PLEventGuestsService.getPLEventGuestsByLocationAndType`. */
interface Attendee {
  /** Total attendees for the event before pagination, repeated on every row. */
  count?: number;
  memberUid: string;
  topics?: string[];
  isHost?: boolean;
  isSpeaker?: boolean;
  isSponsor?: boolean;
  member?: { name?: string; teamMemberRoles?: Array<{ team?: { uid?: string; name?: string } | null }> };
  /** The team the attendee registered with for the gathering, `{}` when none. */
  team?: { uid?: string; name?: string } | null;
}

interface AttendeeResult {
  attendees: Attendee[];
  /** Rows the page service returned before the tool's own filters. */
  fetched: number;
  /** The service's total for the event; larger than `fetched` when a page was truncated. */
  total: number;
}

const TEAM_PROFILE_SELECT = {
  uid: true,
  name: true,
  shortDescription: true,
  longDescription: true,
  industryTags: { select: { title: true } },
  technologies: { select: { title: true } },
  teamFocusAreas: { select: { focusArea: { select: { title: true } }, ancestorArea: { select: { title: true } } } },
} as const;

type TeamProfile = Prisma.TeamGetPayload<{ select: typeof TEAM_PROFILE_SELECT }>;

interface AttendeeTeams {
  byUid: Map<string, TeamProfile>;
  /** Teams where the member currently holds a role (no end date, or one in the future). */
  activeByMember: Map<string, TeamProfile[]>;
}

/**
 * Answers "which IRL events…" and "who is going to…" questions. Attendee lists come from
 * `PLEventGuestsService`, the service behind the public IRL Gatherings page, so the model sees
 * exactly the attendees the asking member could already see there: invite-only events are
 * hidden from anonymous viewers and from members not attending them, rejected members are
 * excluded, and guests registered for the gathering as a whole (rather than one of its events)
 * are listed for every event at that location, as the page lists them.
 */
@Injectable()
export class IrlEventsTool {
  private locationsList: string[] = [];

  constructor(
    private logger: LogService,
    private prisma: PrismaService,
    private guestsService: PLEventGuestsService,
    private membersService: MembersService
  ) {}

  async initialize() {
    const locations = await this.prisma.pLEventLocation.findMany({
      where: { isDeleted: false },
      select: { location: true },
    });
    this.locationsList = locations.map((location) => location.location);
  }

  getTool(auth: HuskyAuthContext): CoreTool {
    // The viewer is resolved once per answer, however many times the model calls the tool.
    let viewer: Promise<ViewerMember | null> | undefined;
    const loadViewer: LoadViewer = () => (viewer ??= this.loadViewer(auth));
    return tool({
      description:
        'Look up IRL events and gatherings, past, current and upcoming, with their attendees. Use it for "who is going to / attending / speaking at <event>" questions. Returns each event with name, type, description, website, location, dates, resources, and the attendee list (name, team, host/speaker/sponsor role, topics), optionally narrowed to attendees from teams working on a topic.',
      parameters: IrlEventsToolParams.extend({
        location: IrlEventsToolParams.shape.location.describe(
          `The location (gathering city) to search for. Possible values: ${this.locationsList.join(', ')}`
        ),
      }),
      execute: (args) => this.execute(args, loadViewer),
    });
  }

  private async execute(args: IrlEventsToolArgs, loadViewer: LoadViewer) {
    this.logger.info(`Getting IRL events for args: ${JSON.stringify(args)}`);

    const viewer = await loadViewer();
    let effectiveArgs = args;
    let events = await this.findEvents(effectiveArgs, viewer);
    for (const fallbackArgs of this.argFallbacks(args)) {
      if (events.length > 0) break;
      effectiveArgs = fallbackArgs;
      events = await this.findEvents(effectiveArgs, viewer);
    }
    if (events.length === 0) {
      return 'No IRL events found matching the search criteria.';
    }
    const guestNameDropped = Boolean(args.guestName) && !effectiveArgs.guestName;

    const now = new Date();
    const limit = pLimit(ATTENDEE_FETCH_CONCURRENCY);
    const sections = await Promise.all(
      events.map((event) =>
        limit(async () => {
          let result: AttendeeResult | null;
          try {
            result = await this.fetchAttendees(event, effectiveArgs, viewer);
            this.logger.info(
              `IRL events tool: event ${event.uid} "${event.name}" -> ${result.attendees.length} attendees (${result.fetched} of ${result.total} fetched)`
            );
          } catch (error) {
            // One event's attendee lookup failing should not take the other events' answers with it.
            this.logger.error(`IRL events tool: attendees for event ${event.uid} failed: ${error?.message ?? error}`);
            result = null;
          }
          return this.formatEvent(event, result, effectiveArgs, guestNameDropped ? args.guestName : undefined, now);
        })
      )
    );
    return sections.join('\n\n');
  }

  /**
   * Argument variants to retry with when the literal arguments matched nothing: progressively
   * looser search terms, and — when the model put the event name into `guestName` with no
   * `search` at all — the same name as the event search instead.
   */
  private argFallbacks(args: IrlEventsToolArgs): IrlEventsToolArgs[] {
    const variants: IrlEventsToolArgs[] = this.searchFallbacks(args.search).map((search) => ({ ...args, search }));
    if (args.guestName && !args.search) {
      variants.push({ ...args, search: args.guestName, guestName: undefined });
    }
    return variants;
  }

  /**
   * Progressively looser search terms: first without filler words ("Rohan LLC event" ->
   * "Rohan LLC"), then the single longest word as a proxy for the distinctive one.
   */
  private searchFallbacks(search: string | undefined): string[] {
    if (!search) return [];
    const withoutFiller = search
      .split(/\s+/)
      .filter((word) => word && !EVENT_FILLER_WORDS.has(word.toLowerCase()))
      .join(' ');
    const candidates = [withoutFiller, longestWord(withoutFiller || search)];
    return Array.from(new Set(candidates.filter((c): c is string => Boolean(c) && c !== search)));
  }

  private async loadViewer(auth: HuskyAuthContext): Promise<ViewerMember | null> {
    if (!auth.isLoggedIn || !auth.email) {
      return null;
    }
    const member = await this.membersService.findMemberByEmail(auth.email);
    return member && !member.deletedAt ? member : null;
  }

  /**
   * Upcoming events come first (soonest first), then past ones (most recent first), so a broad
   * query for a location with a long history still surfaces its current edition.
   */
  private async findEvents(args: IrlEventsToolArgs, viewer: ViewerMember | null): Promise<EventRow[]> {
    const now = new Date();
    const { where, endDate } = this.buildWhere(args, viewer);
    const orderBy: Prisma.PLEventOrderByWithRelationInput | undefined =
      args.orderBy === 'name' ? { name: 'asc' } : args.orderBy === 'priority' ? { priority: 'desc' } : undefined;

    const queries: Array<{ where: Prisma.PLEventWhereInput; orderBy: Prisma.PLEventOrderByWithRelationInput }> = [];
    if (args.timeframe !== 'past') {
      queries.push({
        where: { ...where, endDate: { ...endDate, gte: now } },
        orderBy: orderBy ?? { startDate: 'asc' },
      });
    }
    if (args.timeframe !== 'upcoming') {
      queries.push({
        where: { ...where, endDate: { ...endDate, lt: now } },
        orderBy: orderBy ?? { startDate: 'desc' },
      });
    }

    const seen = new Set<string>();
    const events: EventRow[] = [];
    for (const query of queries) {
      const rows = await this.prisma.pLEvent.findMany({
        where: query.where,
        include: { location: true },
        orderBy: query.orderBy,
        // Fetch a little past the cap so hiding invite-only events doesn't leave the list short.
        take: MAX_EVENTS * 2,
      });
      for (const row of rows) {
        if (!seen.has(row.uid)) {
          seen.add(row.uid);
          events.push(row);
        }
      }
    }

    const visible = await this.guestsService.filterEventsByAttendanceAndAdminStatus([], events, viewer);
    return visible.slice(0, MAX_EVENTS);
  }

  private buildWhere(
    args: IrlEventsToolArgs,
    viewer: ViewerMember | null
  ): { where: Prisma.PLEventWhereInput; endDate: Prisma.DateTimeFilter } {
    const where: Prisma.PLEventWhereInput = { isDeleted: false };
    // Kept apart from `where` so the caller can add the timeframe bound to it.
    const endDate: Prisma.DateTimeFilter = {};
    const and: Prisma.PLEventWhereInput[] = [];

    if (args.fromDate) where.startDate = { gte: new Date(args.fromDate) };
    if (args.toDate) endDate.lte = new Date(args.toDate);
    if (args.location) where.location = { location: args.location };

    if (args.search) {
      where.OR = [
        { name: { contains: args.search, mode: 'insensitive' } },
        { description: { contains: args.search, mode: 'insensitive' } },
        { location: { location: { contains: args.search, mode: 'insensitive' } } },
      ];
    }

    if (args.guestName) {
      const nameMatch: Prisma.PLEventGuestWhereInput = {
        OR: [
          { member: { name: { contains: args.guestName, mode: 'insensitive' } } },
          { team: { name: { contains: args.guestName, mode: 'insensitive' } } },
        ],
      };
      // A guest can be registered for the whole gathering (eventUid null) rather than one of
      // its events, which is how the IRL Gatherings page lists most attendees.
      and.push({
        OR: [
          { eventGuests: { some: nameMatch } },
          { location: { guests: { some: { eventUid: null, ...nameMatch } } } },
        ],
      });
    }

    // Anonymous viewers never see invite-only events on the page; excluding them here keeps
    // `take` exact instead of relying on the post-filter over an already-cut list.
    if (!viewer) {
      and.push({ OR: [{ type: null }, { type: { not: 'INVITE_ONLY' } }] });
    }

    if (and.length) where.AND = and;
    return { where, endDate };
  }

  private async fetchAttendees(
    event: EventRow,
    args: IrlEventsToolArgs,
    viewer: ViewerMember | null
  ): Promise<AttendeeResult> {
    if (!event.locationUid) {
      return { attendees: [], fetched: 0, total: 0 };
    }
    const rows: Attendee[] = await this.guestsService.getPLEventGuestsByLocationAndType(
      event.locationUid,
      { filteredEvents: [event.uid], limit: ATTENDEE_FETCH_LIMIT, page: 1 },
      viewer
    );
    const total = rows[0]?.count ?? rows.length;
    let attendees = rows;
    if (args.guestName) {
      // The page service only applies its name search to event-level guests, not to guests
      // registered for the whole gathering, so the name filter is applied here over both.
      const needle = args.guestName.toLowerCase();
      attendees = attendees.filter((attendee) =>
        [attendee.member?.name, attendee.team?.name, ...this.attendeeTeamNames(attendee)].some((name) =>
          name?.toLowerCase().includes(needle)
        )
      );
    }
    if (args.attendeeTopic && attendees.length > 0) {
      const teams = await this.loadTeams(attendees);
      attendees = attendees.filter((attendee) =>
        this.attendeeMatchesTopic(attendee, args.attendeeTopic as string, teams)
      );
    }
    return { attendees, fetched: rows.length, total };
  }

  private attendeeTeamNames(attendee: Attendee): string[] {
    return (attendee.member?.teamMemberRoles ?? [])
      .map((role) => role.team?.name)
      .filter((name): name is string => Boolean(name));
  }

  /**
   * Teams that can qualify an attendee for a topic: the team they registered with, plus the
   * teams where they currently hold a role. Roles are re-read here because the page service's
   * rows drop the role's end date, and a former team should not vouch for someone today.
   */
  private async loadTeams(attendees: Attendee[]): Promise<AttendeeTeams> {
    const memberUids = attendees.map((attendee) => attendee.memberUid);
    const registeredUids = attendees.map((attendee) => attendee.team?.uid).filter((uid): uid is string => Boolean(uid));
    const activeRole: Prisma.TeamMemberRoleWhereInput = {
      memberUid: { in: memberUids },
      OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
    };
    const teams = await this.prisma.team.findMany({
      where: { OR: [{ uid: { in: registeredUids } }, { teamMemberRoles: { some: activeRole } }] },
      select: { ...TEAM_PROFILE_SELECT, teamMemberRoles: { where: activeRole, select: { memberUid: true } } },
    });
    const byUid = new Map<string, TeamProfile>();
    const activeByMember = new Map<string, TeamProfile[]>();
    for (const { teamMemberRoles, ...team } of teams) {
      byUid.set(team.uid, team);
      for (const role of teamMemberRoles) {
        activeByMember.set(role.memberUid, [...(activeByMember.get(role.memberUid) ?? []), team]);
      }
    }
    return { byUid, activeByMember };
  }

  /**
   * "From teams working on storage": a team qualifies through its focus areas, industry tags or
   * technologies (terse tags, fuzzy-matched) or through a mention in its description; the
   * attendee also qualifies directly through the topics they registered interest in.
   */
  private attendeeMatchesTopic(attendee: Attendee, topic: string, teams: AttendeeTeams): boolean {
    if ((attendee.topics ?? []).some((attendeeTopic) => fuzzyMatches(attendeeTopic, topic))) {
      return true;
    }
    const registered = attendee.team?.uid ? teams.byUid.get(attendee.team.uid) : undefined;
    const candidates = [...(registered ? [registered] : []), ...(teams.activeByMember.get(attendee.memberUid) ?? [])];
    return candidates.some((team) => this.teamMatchesTopic(team, topic));
  }

  private teamMatchesTopic(team: TeamProfile, topic: string): boolean {
    const tags = [
      ...team.teamFocusAreas.flatMap((area) => [area.focusArea.title, area.ancestorArea.title]),
      ...team.industryTags.map((tag) => tag.title),
      ...team.technologies.map((tech) => tech.title),
    ];
    if (tags.some((tag) => fuzzyMatches(tag, topic))) {
      return true;
    }
    return [team.shortDescription, team.longDescription].some((text) => text && textMentions(text, topic));
  }

  private formatEvent(
    event: EventRow,
    result: AttendeeResult | null,
    args: IrlEventsToolArgs,
    droppedGuestName: string | undefined,
    now: Date
  ): string {
    const location = event.location ? `Location: ${event.location.location} (${event.location.timezone})` : '';
    const dateRange =
      event.startDate && event.endDate
        ? `Dates: ${new Date(event.startDate).toLocaleDateString()} to ${new Date(event.endDate).toLocaleDateString()}`
        : '';
    const status = new Date(event.endDate) >= now ? 'Upcoming or ongoing' : 'Past';
    const resources = event.resources?.length
      ? `Resources: ${event.resources
          .map((r) => {
            if (r && typeof r === 'object' && !Array.isArray(r)) {
              const resource = r as { name?: string; url?: string };
              return `${resource.name || ''} (${resource.url || ''})`;
            }
            return '';
          })
          .filter(Boolean)
          .join(', ')}`
      : '';
    const locationResources = event.location?.resources?.length
      ? `Location Resources: ${event.location.resources
          .map((r) => {
            if (r && typeof r === 'object' && !Array.isArray(r)) {
              const resource = r as { description?: string; url?: string };
              return `${resource.description || ''} (${resource.url || ''})`;
            }
            return '';
          })
          .filter(Boolean)
          .join(', ')}`
      : '';

    return `Event ID: ${event.uid}
                [EventLink](/events/irl?location=${event.location?.location})
                Name: ${event.name}
                Status: ${status}
                Type: ${event.type}
                Description: ${event.description}
                Website: ${event.websiteURL}
                ${location}
                ${dateRange}
                ${resources}
                ${locationResources}
                ${this.formatAttendees(result, args, droppedGuestName)}`;
  }

  private formatAttendees(
    result: AttendeeResult | null,
    args: IrlEventsToolArgs,
    droppedGuestName: string | undefined
  ): string {
    if (!result) {
      return 'Attendees: could not be loaded right now';
    }
    const filters = [
      args.attendeeTopic ? `from teams working on "${args.attendeeTopic}"` : undefined,
      args.guestName ? `named like "${args.guestName}"` : undefined,
    ].filter((f): f is string => Boolean(f));
    const notes: string[] = [];
    if (droppedGuestName) {
      notes.push(
        `Note: no attendee named "${droppedGuestName}" was found, so this lists all attendees of events matching "${droppedGuestName}" instead.`
      );
    }
    if (result.total > result.fetched) {
      notes.push(
        `Note: only the first ${result.fetched} of ${result.total} attendees were checked; the list${
          filters.length ? ' and filter' : ''
        } may be incomplete.`
      );
    }
    const noteText = notes.length ? `\n                ${notes.join('\n                ')}` : '';

    const { attendees } = result;
    if (attendees.length === 0) {
      return (
        (filters.length
          ? `Attendees: none of the listed attendees are ${filters.join(' and ')}`
          : 'Attendees: none listed yet') + noteText
      );
    }
    const heading = filters.length
      ? `Attendees ${filters.join(' and ')} (${attendees.length})`
      : `Attendees (${attendees.length})`;
    const lines = attendees.slice(0, MAX_ATTENDEES_SHOWN).map((attendee) => {
      const roles: string[] = [];
      if (attendee.isHost) roles.push('Host');
      if (attendee.isSpeaker) roles.push('Speaker');
      if (attendee.isSponsor) roles.push('Sponsor');
      const team = attendee.team?.name ? ` — ${attendee.team.name}` : '';
      const roleText = roles.length ? ` (${roles.join(', ')})` : '';
      const topics = attendee.topics?.length ? `; topics: ${attendee.topics.join(', ')}` : '';
      return `- ${attendee.member?.name ?? 'Unknown'}${team}${roleText}${topics} [MemberLink](/members/${
        attendee.memberUid
      })`;
    });
    const more =
      attendees.length > MAX_ATTENDEES_SHOWN
        ? `\n                ... and ${attendees.length - MAX_ATTENDEES_SHOWN} more`
        : '';
    return `${heading}:${noteText}\n                ${lines.join('\n                ')}${more}`;
  }
}
