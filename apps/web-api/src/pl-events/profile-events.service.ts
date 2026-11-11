import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ProfileEventsGroup,
  ProfileEventsQuery,
  ResponseMemberEvents,
  ResponseTeamEvents,
} from 'libs/contracts/src/schema/profile-events';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { TeamsService } from '../teams/teams.service';
import {
  facesFindArgs,
  GUEST_PERSON_SELECT,
  hidesAttendance,
  LISTED_GUEST_MEMBER_WHERE,
  listedGuestsWhereIn,
} from './pl-event-detail';
import {
  applySummaries,
  AttendanceSummary,
  emptyGroup,
  groupTeamUpcoming,
  MemberGuestRow,
  mergeRoles,
  mergeTeamPast,
  pageOf,
  ProfileRole,
  rolesOfAssociation,
  rolesOfGuest,
  TeamMemberGuestRow,
  TeamPastSource,
  toDemoDayItems,
  toMemberEventCards,
} from './profile-events';

/** The event fields an event card needs. */
const EVENT_CARD_SELECT = {
  uid: true,
  name: true,
  type: true,
  startDate: true,
  endDate: true,
  locationUid: true,
  logo: { select: { url: true } },
  location: { select: { location: true } },
} as const;

/** Above this many rows, a team's in-memory grouping should move to SQL (design, Risks). */
const TEAM_ROWS_WARN_AT = 500;

type Viewer = { uid: string } | null;
type GroupName = 'upcoming' | 'past';

/**
 * `GET /v1/members/:uid/events` and `GET /v1/teams/:uid/events` (LAB-3215, design D10).
 *
 * Lives in the `pl-events` module with the guest logic: `pl-events` already depends on members and teams, and the
 * reverse would be a module cycle. Lists are built in memory and paged (a member or a team has tens of events);
 * attendance summaries are loaded only for the page.
 */
@Injectable()
export class ProfileEventsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => TeamsService))
    private teamsService: TeamsService,
    private logger: LogService
  ) {}

  async getMemberEvents(uid: string, viewer: Viewer, query: ProfileEventsQuery): Promise<ResponseMemberEvents> {
    const member = await this.prisma.member.findUnique({ where: { uid }, select: { uid: true } });
    if (!member) {
      throw new NotFoundException(`Member not found with uid ${uid}.`);
    }
    const isOwner = !!viewer && viewer.uid === uid;
    const now = new Date();
    const result: ResponseMemberEvents = {};
    if (wants(query, 'upcoming')) {
      // Upcoming plans are for signed-in viewers only.
      result.upcoming = viewer
        ? await this.memberGroup(uid, isOwner, 'upcoming', now, query, viewer)
        : emptyGroup(query.limit);
    }
    if (wants(query, 'past')) {
      result.past = await this.memberGroup(uid, isOwner, 'past', now, query, viewer);
    }
    return result;
  }

  async getTeamEvents(
    uid: string,
    viewer: Viewer,
    userEmail: string | undefined,
    query: ProfileEventsQuery
  ): Promise<ResponseTeamEvents> {
    // The same 404 / L0 rule as GET /v1/teams/:uid (team-public-visibility).
    await this.teamsService.assertTeamVisibleToViewer(uid, userEmail);
    const now = new Date();
    const result: ResponseTeamEvents = {};
    if (wants(query, 'upcoming')) {
      result.upcoming = viewer ? await this.teamUpcoming(uid, now, query, viewer) : emptyGroup(query.limit);
    }
    if (wants(query, 'past')) {
      result.past = await this.teamPast(uid, now, query, viewer);
    }
    return result;
  }

  private async memberGroup(
    uid: string,
    isOwner: boolean,
    group: GroupName,
    now: Date,
    query: ProfileEventsQuery,
    viewer: Viewer
  ) {
    const rows = await this.prisma.pLEventGuest.findMany({
      where: {
        memberUid: uid,
        eventUid: { not: null },
        // Hidden rows are listed, and counted, only for their owner.
        ...(isOwner ? {} : { showOnProfile: true }),
        event: { isDeleted: false, endDate: group === 'upcoming' ? { gt: now } : { lte: now } },
      },
      orderBy: { event: { startDate: group === 'upcoming' ? 'asc' : 'desc' } },
      select: {
        eventUid: true,
        isHost: true,
        isSpeaker: true,
        isSponsor: true,
        showOnProfile: true,
        event: { select: EVENT_CARD_SELECT },
      },
    });
    const cards = toMemberEventCards(rows.filter((row) => !!row.event && !!row.eventUid) as MemberGuestRow[]);
    return this.withSummaries(pageOf(cards, query.page, query.limit), viewer);
  }

  private async teamUpcoming(uid: string, now: Date, query: ProfileEventsQuery, viewer: Viewer) {
    const roles = await this.prisma.teamMemberRole.findMany({
      where: { teamUid: uid, OR: [{ endDate: null }, { endDate: { gt: now } }] },
      select: { memberUid: true },
    });
    const memberUids = roles.map((role) => role.memberUid);
    if (!memberUids.length) {
      return emptyGroup<never>(query.limit);
    }
    const rows = await this.prisma.pLEventGuest.findMany({
      where: {
        memberUid: { in: memberUids },
        eventUid: { not: null },
        showOnProfile: true,
        member: LISTED_GUEST_MEMBER_WHERE,
        event: { isDeleted: false, endDate: { gt: now } },
      },
      select: { eventUid: true, createdAt: true, ...GUEST_PERSON_SELECT, event: { select: EVENT_CARD_SELECT } },
    });
    if (rows.length > TEAM_ROWS_WARN_AT) {
      this.logger.info(`Team events: ${rows.length} upcoming member rows for team ${uid}; consider SQL grouping`);
    }
    const valid = rows.filter((row) => !!row.event && !!row.eventUid) as TeamMemberGuestRow[];
    const teamRoles = await this.teamRolesFor(uid, [...new Set(valid.map((row) => row.eventUid))]);
    return this.withSummaries(pageOf(groupTeamUpcoming(valid, teamRoles), query.page, query.limit), viewer);
  }

  private async teamPast(uid: string, now: Date, query: ProfileEventsQuery, viewer: Viewer) {
    const pastEvent = { isDeleted: false, endDate: { lte: now } };
    const [guestRows, associations, demoDays] = await Promise.all([
      this.prisma.pLEventGuest.findMany({
        where: {
          teamUid: uid,
          eventUid: { not: null },
          OR: [{ isHost: true }, { isSpeaker: true }, { isSponsor: true }],
          event: pastEvent,
        },
        select: { isHost: true, isSpeaker: true, isSponsor: true, event: { select: EVENT_CARD_SELECT } },
      }),
      this.prisma.pLEventAssociation.findMany({
        where: { entityType: 'TEAM', teamUid: uid, event: pastEvent },
        select: { role: true, event: { select: EVENT_CARD_SELECT } },
      }),
      this.prisma.demoDay.findMany({
        where: {
          isDeleted: false,
          endDate: { lt: now },
          participants: { some: { type: 'FOUNDER', status: 'ENABLED', teamUid: uid, isDeleted: false } },
        },
        select: { uid: true, title: true, slugURL: true, startDate: true, endDate: true },
      }),
    ]);
    // Only events the team had a role in: an ATTENDEE association alone does not make a team event.
    const sources = (
      [
        ...guestRows.map((row) => ({ event: row.event, roles: rolesOfGuest(row) })),
        ...associations.map((row) => ({ event: row.event, roles: rolesOfAssociation(row.role) })),
      ] as TeamPastSource[]
    ).filter((source) => !!source.event && source.roles.length > 0);
    const items = [...toDemoDayItems(demoDays), ...mergeTeamPast(sources)];
    return this.withSummaries(pageOf(items, query.page, query.limit), viewer);
  }

  /** The team's own roles per event: guest rows that name the team, and the team's event associations. */
  private async teamRolesFor(teamUid: string, eventUids: string[]): Promise<Map<string, ProfileRole[]>> {
    const result = new Map<string, ProfileRole[]>();
    if (!eventUids.length) {
      return result;
    }
    const [guestRows, associations] = await Promise.all([
      this.prisma.pLEventGuest.findMany({
        where: {
          teamUid,
          eventUid: { in: eventUids },
          OR: [{ isHost: true }, { isSpeaker: true }, { isSponsor: true }],
        },
        select: { eventUid: true, isHost: true, isSpeaker: true, isSponsor: true },
      }),
      this.prisma.pLEventAssociation.findMany({
        where: { entityType: 'TEAM', teamUid, eventUid: { in: eventUids } },
        select: { eventUid: true, role: true },
      }),
    ]);
    for (const row of guestRows) {
      if (row.eventUid) result.set(row.eventUid, mergeRoles(result.get(row.eventUid) ?? [], rolesOfGuest(row)));
    }
    for (const row of associations) {
      result.set(row.eventUid, mergeRoles(result.get(row.eventUid) ?? [], rolesOfAssociation(row.role)));
    }
    return result;
  }

  private async withSummaries<T extends { kind: string; uid: string; type?: string | null }>(
    group: ProfileEventsGroup<T>,
    viewer: Viewer
  ): Promise<ProfileEventsGroup<T>> {
    const summaries = await this.loadSummaries(group.items, viewer);
    return { ...group, items: applySummaries(group.items, summaries) };
  }

  /**
   * Going count, faces and `viewerGoing` for one page of events, by the rule of `GET /v1/irl/events/:uid`: distinct
   * listed members (REJECTED left out), the newest three as faces, and nothing for signed-out viewers of
   * `INVITE_ONLY` events.
   */
  private async loadSummaries(
    items: Array<{ kind: string; uid: string; type?: string | null }>,
    viewer: Viewer
  ): Promise<Map<string, AttendanceSummary>> {
    const events = items.filter((item) => item.kind === 'event');
    const summaries = new Map<string, AttendanceSummary>();
    if (!events.length) {
      return summaries;
    }
    const eventUids = events.map((item) => item.uid);
    const counted = events.filter((item) => !hidesAttendance(item.type, !!viewer)).map((item) => item.uid);
    const [goingGroups, faceLists, viewerRows] = await Promise.all([
      counted.length
        ? this.prisma.pLEventGuest.groupBy({ by: ['eventUid', 'memberUid'], where: listedGuestsWhereIn(counted) })
        : Promise.resolve([] as Array<{ eventUid: string | null; memberUid: string }>),
      Promise.all(counted.map((eventUid) => this.prisma.pLEventGuest.findMany(facesFindArgs(eventUid)))),
      viewer
        ? this.prisma.pLEventGuest.findMany({
            where: { memberUid: viewer.uid, eventUid: { in: eventUids } },
            select: { eventUid: true },
          })
        : Promise.resolve([]),
    ]);
    const going = new Set(viewerRows.map((row) => row.eventUid));
    for (const eventUid of eventUids) {
      const index = counted.indexOf(eventUid);
      summaries.set(eventUid, {
        goingCount: goingGroups.filter((row) => row.eventUid === eventUid).length,
        faces: index >= 0 ? faceLists[index].map((row) => row.member) : [],
        viewerGoing: going.has(eventUid),
      });
    }
    return summaries;
  }
}

function wants(query: ProfileEventsQuery, group: GroupName): boolean {
  return !query.group || query.group === group;
}
