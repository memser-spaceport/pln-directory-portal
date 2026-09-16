import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
 * Attendees are fetched through the same paginated service the IRL Gatherings page uses, so a
 * large gathering needs a page big enough that an `attendeeTopic` filter applied afterwards
 * still has the full list to work from.
 */
const ATTENDEE_FETCH_LIMIT = 300;
const MAX_ATTENDEES_SHOWN = 40;
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
      "'upcoming' for current and future events (use this for who-is-going / who-will-attend questions), 'past' for events that already ended. Omit to search both."
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

interface Attendee {
  memberUid: string;
  topics?: string[];
  isHost?: boolean;
  isSpeaker?: boolean;
  isSponsor?: boolean;
  member?: { name?: string; teamMemberRoles?: Array<{ team?: { uid?: string; name?: string } | null }> };
  team?: { uid?: string; name?: string } | null;
}

type TeamProfile = Prisma.TeamGetPayload<{
  select: {
    uid: true;
    name: true;
    shortDescription: true;
    longDescription: true;
    industryTags: { select: { title: true } };
    technologies: { select: { title: true } };
    teamFocusAreas: { select: { focusArea: { select: { title: true } }; ancestorArea: { select: { title: true } } } };
  };
}>;

/**
 * Answers "which IRL events…" and "who is going to…" questions. Attendee lists come from
 * `PLEventGuestsService`, the service behind the public IRL Gatherings page, so the model sees
 * exactly the attendees the asking member could already see there: invite-only events are
 * hidden from anonymous viewers and from members not attending them, rejected members are
 * excluded, and location-level attendees whose stay overlaps the event are included.
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
    return tool({
      description:
        'Look up IRL events and gatherings, past, current and upcoming, with their attendees. Use it for "who is going to / attending / speaking at <event>" questions. Returns each event with name, type, description, website, location, dates, resources, and the attendee list (name, team, host/speaker/sponsor role, topics), optionally narrowed to attendees from teams working on a topic.',
      parameters: IrlEventsToolParams.extend({
        location: IrlEventsToolParams.shape.location.describe(
          `The location (gathering city) to search for. Possible values: ${this.locationsList.join(', ')}`
        ),
      }),
      execute: (args) => this.execute(args, auth),
    });
  }

  private async execute(args: IrlEventsToolArgs, auth: HuskyAuthContext) {
    this.logger.info(`Getting IRL events for args: ${JSON.stringify(args)}`);

    const viewer = await this.loadViewer(auth);
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

    const now = new Date();
    const sections = await Promise.all(
      events.map(async (event) => {
        const attendees = await this.fetchAttendees(event, effectiveArgs, viewer);
        this.logger.info(`IRL events tool: event ${event.uid} "${event.name}" -> ${attendees.length} attendees`);
        return this.formatEvent(event, attendees, effectiveArgs.attendeeTopic, now);
      })
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

  private async findEvents(args: IrlEventsToolArgs, viewer: ViewerMember | null) {
    const where: Prisma.PLEventWhereInput = { isDeleted: false };
    const now = new Date();

    if (args.timeframe === 'upcoming') where.endDate = { gte: now };
    if (args.timeframe === 'past') where.endDate = { lt: now };
    if (args.fromDate) where.startDate = { gte: new Date(args.fromDate) };
    if (args.toDate) where.endDate = { ...(where.endDate as Prisma.DateTimeFilter), lte: new Date(args.toDate) };
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
      where.AND = [
        {
          OR: [
            { eventGuests: { some: nameMatch } },
            { location: { guests: { some: { eventUid: null, ...nameMatch } } } },
          ],
        },
      ];
    }

    const orderBy: Prisma.PLEventOrderByWithRelationInput =
      args.orderBy === 'name'
        ? { name: 'asc' }
        : args.orderBy === 'priority'
        ? { priority: 'desc' }
        : { startDate: args.timeframe === 'past' ? 'desc' : 'asc' };

    const events = await this.prisma.pLEvent.findMany({
      where,
      include: { location: true },
      orderBy,
      // Fetch a little past the cap so hiding invite-only events doesn't leave the list short.
      take: MAX_EVENTS * 2,
    });

    // The guests service types its event list by the IRL page's own select shape; the rows here
    // are supersets of it, so the round-trip cast is safe.
    type PageEvents = Parameters<PLEventGuestsService['filterEventsByAttendanceAndAdminStatus']>[1];
    const visible = await this.guestsService.filterEventsByAttendanceAndAdminStatus(
      [],
      events as unknown as PageEvents,
      viewer
    );
    return (visible as unknown as typeof events).slice(0, MAX_EVENTS);
  }

  private async fetchAttendees(
    event: { uid: string; locationUid: string | null },
    args: IrlEventsToolArgs,
    viewer: ViewerMember | null
  ): Promise<Attendee[]> {
    if (!event.locationUid) {
      return [];
    }
    const attendees: Attendee[] = await this.guestsService.getPLEventGuestsByLocationAndType(
      event.locationUid,
      { filteredEvents: [event.uid], search: args.guestName, limit: ATTENDEE_FETCH_LIMIT, page: 1 },
      viewer
    );
    if (!args.attendeeTopic || attendees.length === 0) {
      return attendees;
    }
    const teams = await this.loadTeams(attendees);
    return attendees.filter((attendee) => this.attendeeMatchesTopic(attendee, args.attendeeTopic as string, teams));
  }

  private async loadTeams(attendees: Attendee[]): Promise<Map<string, TeamProfile>> {
    const teamUids = new Set<string>();
    for (const attendee of attendees) {
      for (const uid of this.attendeeTeamUids(attendee)) teamUids.add(uid);
    }
    if (teamUids.size === 0) {
      return new Map();
    }
    const teams = await this.prisma.team.findMany({
      where: { uid: { in: Array.from(teamUids) } },
      select: {
        uid: true,
        name: true,
        shortDescription: true,
        longDescription: true,
        industryTags: { select: { title: true } },
        technologies: { select: { title: true } },
        teamFocusAreas: {
          select: { focusArea: { select: { title: true } }, ancestorArea: { select: { title: true } } },
        },
      },
    });
    return new Map(teams.map((team) => [team.uid, team]));
  }

  private attendeeTeamUids(attendee: Attendee): string[] {
    const uids = [attendee.team?.uid, ...(attendee.member?.teamMemberRoles ?? []).map((role) => role.team?.uid)];
    return uids.filter((uid): uid is string => Boolean(uid));
  }

  /**
   * "From teams working on storage": a team qualifies through its focus areas, industry tags or
   * technologies (terse tags, fuzzy-matched) or through a mention in its description; the
   * attendee also qualifies directly through the topics they registered interest in.
   */
  private attendeeMatchesTopic(attendee: Attendee, topic: string, teams: Map<string, TeamProfile>): boolean {
    if ((attendee.topics ?? []).some((attendeeTopic) => fuzzyMatches(attendeeTopic, topic))) {
      return true;
    }
    return this.attendeeTeamUids(attendee).some((uid) => {
      const team = teams.get(uid);
      return team ? this.teamMatchesTopic(team, topic) : false;
    });
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
    event: Prisma.PLEventGetPayload<{ include: { location: true } }>,
    attendees: Attendee[],
    attendeeTopic: string | undefined,
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
                ${this.formatAttendees(attendees, attendeeTopic)}`;
  }

  private formatAttendees(attendees: Attendee[], attendeeTopic: string | undefined): string {
    if (attendees.length === 0) {
      return attendeeTopic
        ? `Attendees: none of the listed attendees are from teams working on "${attendeeTopic}"`
        : 'Attendees: none listed yet';
    }
    const heading = attendeeTopic
      ? `Attendees from teams working on "${attendeeTopic}" (${attendees.length})`
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
    return `${heading}:\n                ${lines.join('\n                ')}${more}`;
  }
}
