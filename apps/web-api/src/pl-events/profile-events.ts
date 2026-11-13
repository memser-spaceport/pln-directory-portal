import type {
  MemberProfileEvent,
  ProfileEventsGroup,
  TeamPastEvent,
  TeamProfileDemoDay,
  TeamProfileEvent,
} from 'libs/contracts/src/schema/profile-events';
import { cityOf } from './pl-event-detail';

/**
 * `GET /v1/members/:uid/events` and `GET /v1/teams/:uid/events` (LAB-3215): pure helpers that turn the rows
 * `ProfileEventsService` loads into the response. Kept out of the service so they can be tested without Prisma.
 */

export type ProfileRole = 'Host' | 'Speaker' | 'Sponsor';

const ROLE_ORDER: ProfileRole[] = ['Host', 'Speaker', 'Sponsor'];

export type GuestRoleFlags = { isHost: boolean; isSpeaker: boolean; isSponsor: boolean };

export function rolesOfGuest(row: GuestRoleFlags): ProfileRole[] {
  const roles: ProfileRole[] = [];
  if (row.isHost) roles.push('Host');
  if (row.isSpeaker) roles.push('Speaker');
  if (row.isSponsor) roles.push('Sponsor');
  return roles;
}

/** `PLEventAssociation.role` → card role. `ATTENDEE` is plain participation and gives no role. */
export function rolesOfAssociation(role: string): ProfileRole[] {
  switch (role) {
    case 'HOST':
    case 'CO_HOST':
      return ['Host'];
    case 'SPEAKER':
      return ['Speaker'];
    case 'SPONSOR':
      return ['Sponsor'];
    default:
      return [];
  }
}

export function mergeRoles(...lists: ProfileRole[][]): ProfileRole[] {
  const seen = new Set(lists.flat());
  return ROLE_ORDER.filter((role) => seen.has(role));
}

/** One page of a group. `total` counts every item, for "Show all N". */
export function pageOf<T>(items: T[], page: number, limit: number): ProfileEventsGroup<T> {
  const start = (page - 1) * limit;
  return { page, limit, total: items.length, items: items.slice(start, start + limit) };
}

export function emptyGroup<T>(limit: number): ProfileEventsGroup<T> {
  return { page: 1, limit, total: 0, items: [] };
}

/** Upcoming while the event has not ended, so an event in progress still shows as "going". */
export function isUpcoming(event: { endDate: Date | string }, now: Date): boolean {
  return new Date(event.endDate).getTime() > now.getTime();
}

export type PersonRow = { uid: string; name: string; image: { url: string } | null };

export function toPerson(row: PersonRow) {
  return { uid: row.uid, name: row.name, image: row.image?.url ?? null };
}

export type EventCardRow = {
  uid: string;
  name: string;
  type: string | null;
  startDate: Date;
  endDate: Date;
  logo: { url: string } | null;
  locationUid: string | null;
  location: { location: string } | null;
};

/** What the attendee list shows for one event: the same numbers as `GET /v1/irl/events/:uid`. */
export type AttendanceSummary = { goingCount: number; faces: PersonRow[]; viewerGoing: boolean };

export const NO_ATTENDANCE: AttendanceSummary = { goingCount: 0, faces: [], viewerGoing: false };

export function toEventFields(event: EventCardRow, roles: ProfileRole[], summary: AttendanceSummary): TeamPastEvent {
  const location = event.location?.location ?? null;
  return {
    kind: 'event',
    uid: event.uid,
    name: event.name,
    type: event.type ?? null,
    startDate: new Date(event.startDate).toISOString(),
    endDate: new Date(event.endDate).toISOString(),
    logo: event.logo?.url ?? null,
    locationUid: event.locationUid ?? null,
    location,
    city: cityOf(location),
    roles,
    goingCount: summary.goingCount,
    faces: summary.faces.map(toPerson),
    viewerGoing: summary.viewerGoing,
  };
}

export type MemberGuestRow = GuestRoleFlags & {
  eventUid: string;
  showOnProfile: boolean;
  event: EventCardRow;
};

/**
 * A member's rows → one card per event, in the order given. Duplicate rows for one event (the database has no unique
 * constraint) merge their roles; the event stays hidden only if every row is hidden.
 */
export function toMemberEventCards(rows: MemberGuestRow[]): MemberProfileEvent[] {
  const byEvent = new Map<string, { row: MemberGuestRow; roles: ProfileRole[]; showOnProfile: boolean }>();
  for (const row of rows) {
    const seen = byEvent.get(row.eventUid);
    if (seen) {
      seen.roles = mergeRoles(seen.roles, rolesOfGuest(row));
      seen.showOnProfile = seen.showOnProfile || row.showOnProfile;
    } else {
      byEvent.set(row.eventUid, { row, roles: rolesOfGuest(row), showOnProfile: row.showOnProfile });
    }
  }
  return [...byEvent.values()].map(({ row, roles, showOnProfile }) => ({
    ...toEventFields(row.event, roles, NO_ATTENDANCE),
    showOnProfile,
  }));
}

export type TeamMemberGuestRow = { eventUid: string; createdAt: Date; member: PersonRow; event: EventCardRow };

/**
 * The team's members' upcoming rows → one card per event, soonest first. `members` are the newest three distinct
 * members; `memberCount` counts distinct members.
 */
export function groupTeamUpcoming(
  rows: TeamMemberGuestRow[],
  teamRoles: Map<string, ProfileRole[]>
): TeamProfileEvent[] {
  const byEvent = new Map<string, { event: EventCardRow; members: Map<string, { person: PersonRow; at: number }> }>();
  for (const row of rows) {
    let entry = byEvent.get(row.eventUid);
    if (!entry) {
      entry = { event: row.event, members: new Map() };
      byEvent.set(row.eventUid, entry);
    }
    const at = new Date(row.createdAt).getTime();
    const seen = entry.members.get(row.member.uid);
    if (!seen || at > seen.at) {
      entry.members.set(row.member.uid, { person: row.member, at });
    }
  }
  return [...byEvent.values()]
    .sort((a, b) => new Date(a.event.startDate).getTime() - new Date(b.event.startDate).getTime())
    .map(({ event, members }) => {
      const newest = [...members.values()].sort((a, b) => b.at - a.at);
      return {
        ...toEventFields(event, teamRoles.get(event.uid) ?? [], NO_ATTENDANCE),
        memberCount: members.size,
        members: newest.slice(0, 3).map(({ person }) => toPerson(person)),
      };
    });
}

export type TeamPastSource = { event: EventCardRow; roles: ProfileRole[] };

/**
 * The team's past sources (guest rows naming the team with a role, and the team's event associations) → one card per
 * event, newest first, roles merged.
 */
export function mergeTeamPast(sources: TeamPastSource[]): TeamPastEvent[] {
  const byEvent = new Map<string, TeamPastSource>();
  for (const source of sources) {
    const seen = byEvent.get(source.event.uid);
    byEvent.set(source.event.uid, seen ? { event: seen.event, roles: mergeRoles(seen.roles, source.roles) } : source);
  }
  return [...byEvent.values()]
    .sort((a, b) => new Date(b.event.startDate).getTime() - new Date(a.event.startDate).getTime())
    .map(({ event, roles }) => toEventFields(event, roles, NO_ATTENDANCE));
}

export type DemoDayRow = { uid: string; title: string; slugURL: string; startDate: Date; endDate: Date };

/** Demo Days, newest first. They come before the team's other past items. */
export function toDemoDayItems(rows: DemoDayRow[]): TeamProfileDemoDay[] {
  return [...rows]
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
    .map((row) => ({
      kind: 'demo-day',
      uid: row.uid,
      title: row.title,
      slug: row.slugURL,
      startDate: new Date(row.startDate).toISOString(),
      endDate: new Date(row.endDate).toISOString(),
    }));
}

/**
 * Fills going count, faces and `viewerGoing` on the event items of one page. Summaries are loaded only for the page,
 * so a long list costs no more than four cards. Demo Day items pass through.
 */
export function applySummaries<T extends { kind: string; uid: string }>(
  items: T[],
  summaries: Map<string, AttendanceSummary>
): T[] {
  return items.map((item) => {
    if (item.kind !== 'event') return item;
    const summary = summaries.get(item.uid) ?? NO_ATTENDANCE;
    return {
      ...item,
      goingCount: summary.goingCount,
      faces: summary.faces.map(toPerson),
      viewerGoing: summary.viewerGoing,
    };
  });
}
