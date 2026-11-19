import type { ResponsePLEventDetail } from 'libs/contracts/src/schema/pl-event-attendance';
import { assembleEventDetails } from './pl-event-details.mapper';
import { readEventContacts } from './pl-event-write';

/**
 * `GET /v1/irl/events/:uid` (LAB-3213): pure helpers that turn the rows `PLEventsService.getPLEventDetail` loads into
 * the response. Kept out of the service so they can be tested without Prisma.
 */

/**
 * Guest rows whose member the attendee list shows: every member except REJECTED ones, the rule `fetchAttendees`
 * applies in SQL. Hosts, `goingCount` and faces use it, so the count matches the strict attendee list.
 */
export const LISTED_GUEST_MEMBER_WHERE = { NOT: { memberApproval: { state: 'REJECTED' as const } } };

export function listedGuestWhere(eventUid: string) {
  return { eventUid, member: LISTED_GUEST_MEMBER_WHERE };
}

/** The same rule for several events at once: the member and team profile cards (LAB-3215) count like the drawer. */
export function listedGuestsWhereIn(eventUids: string[]) {
  return { eventUid: { in: eventUids }, member: LISTED_GUEST_MEMBER_WHERE };
}

/** A guest row's member as a person: uid, name, image. */
export const GUEST_PERSON_SELECT = { member: { select: { uid: true, name: true, image: { select: { url: true } } } } };

/**
 * The three faces shown for an event: the newest distinct listed members. The drawer (`GET /v1/irl/events/:uid`) and
 * the profile cards (LAB-3215) both use these arguments, so they show the same people.
 */
export function facesFindArgs(eventUid: string) {
  return {
    where: listedGuestWhere(eventUid),
    distinct: ['memberUid' as const],
    orderBy: { createdAt: 'desc' as const },
    take: 3,
    select: GUEST_PERSON_SELECT,
  };
}

/**
 * Signed-out viewers of an `INVITE_ONLY` event see no attendance: count 0 and no faces, as on the drawer and the
 * attendee list.
 */
export function hidesAttendance(eventType: string | null | undefined, isUserLoggedIn: boolean): boolean {
  return !isUserLoggedIn && eventType === 'INVITE_ONLY';
}

/** "Lisbon, Portugal" → "Lisbon". Null when there is nothing before the first comma. */
export function cityOf(location: string | null | undefined): string | null {
  const city = (location ?? '').split(',')[0].trim();
  return city || null;
}

type PersonRow = { uid: string; name: string; image: { url: string } | null } | null;

export type PLEventDetailRow = {
  uid: string;
  name: string;
  slugURL: string;
  type: string | null;
  startDate: Date;
  endDate: Date;
  description: string | null;
  shortDescription: string | null;
  websiteURL: string | null;
  externalId: string | null;
  resources: unknown[];
  /** Holds the part of `details` that is not a column (LAB-3214). */
  additionalInfo?: unknown;
  // The typed columns (LAB-3281). Optional, so a row loaded without them reads as an event that has none.
  timezone?: string | null;
  isAllDay?: boolean | null;
  format?: string | null;
  accessOption?: string | null;
  tags?: string[] | null;
  hostName?: string | null;
  venueAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  registrationUrl?: string | null;
  meetingUrl?: string | null;
  // Approval and ownership (LAB-3325).
  privateDetails?: unknown;
  status?: string | null;
  submitterUid?: string | null;
  reviewNote?: string | null;
  updatedAt?: Date | null;
  logoUid?: string | null;
  bannerUid?: string | null;
  eventAssociations?: Array<{ role: string; memberUid: string | null; teamUid: string | null }>;
  logo: { url: string } | null;
  banner: { url: string } | null;
  location: {
    uid: string;
    location: string;
    flag: string | null;
    timezone: string | null;
    resources: unknown[];
  } | null;
};

export type PLEventDetailParts = {
  /** The gathering's events the viewer may see, already filtered. */
  locationEvents: Array<{ uid: string; name: string; type: string | null; startDate: Date; endDate: Date }>;
  hosts: PersonRow[];
  goingCount: number;
  faces: PersonRow[];
  /** The viewer's own guest row for this event, if they are going. */
  viewerRow: { showOnProfile: boolean; isHost: boolean; isSpeaker: boolean; isSponsor: boolean } | null;
  isUserLoggedIn: boolean;
  /** The viewer submitted the event or is a directory admin: they also get the status and the edit form's fields. */
  isEditor?: boolean;
};

function toPerson(row: PersonRow) {
  return row ? { uid: row.uid, name: row.name, image: row.image?.url ?? null } : null;
}

/** Private resources are for signed-in viewers only, as on the other event reads. */
export function visibleResources(resources: unknown[] | null | undefined, isUserLoggedIn: boolean): unknown[] {
  const list = Array.isArray(resources) ? resources : [];
  return isUserLoggedIn ? list : list.filter((resource: any) => !resource?.isPrivate);
}

/** The venue of an event, or null when it has no address and no position. */
export function eventVenue(event: {
  venueAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): { address: string | null; latitude: number | null; longitude: number | null } | null {
  const address = event.venueAddress ?? null;
  const latitude = event.latitude ?? null;
  const longitude = event.longitude ?? null;
  return address === null && latitude === null && longitude === null ? null : { address, latitude, longitude };
}

export function toPLEventDetail(event: PLEventDetailRow, parts: PLEventDetailParts): ResponsePLEventDetail {
  const roles: Array<'Host' | 'Speaker' | 'Sponsor'> = [];
  if (parts.viewerRow?.isHost) roles.push('Host');
  if (parts.viewerRow?.isSpeaker) roles.push('Speaker');
  if (parts.viewerRow?.isSponsor) roles.push('Sponsor');

  return {
    uid: event.uid,
    name: event.name,
    slugURL: event.slugURL,
    type: event.type ?? null,
    startDate: new Date(event.startDate).toISOString(),
    endDate: new Date(event.endDate).toISOString(),
    description: event.description ?? null,
    shortDescription: event.shortDescription ?? null,
    logo: event.logo?.url ?? null,
    banner: event.banner?.url ?? null,
    websiteUrl: event.websiteURL ?? null,
    externalId: event.externalId ?? null,
    resources: visibleResources(event.resources, parts.isUserLoggedIn),
    location: event.location
      ? {
          uid: event.location.uid,
          location: event.location.location,
          city: cityOf(event.location.location),
          flag: event.location.flag ?? null,
          timezone: event.location.timezone ?? null,
          resources: visibleResources(event.location.resources, parts.isUserLoggedIn),
          events: parts.locationEvents.map((e) => ({
            uid: e.uid,
            name: e.name,
            type: e.type ?? null,
            startDate: new Date(e.startDate).toISOString(),
            endDate: new Date(e.endDate).toISOString(),
          })),
        }
      : null,
    timezone: event.timezone ?? event.location?.timezone ?? null,
    allDay: event.isAllDay === true,
    venue: eventVenue(event),
    registrationUrl: event.registrationUrl ?? null,
    meetingUrl: event.meetingUrl ?? null,
    // Empty details for an event that has none, never missing fields.
    details: assembleEventDetails(event.additionalInfo, event),
    hosts: parts.hosts.map(toPerson).filter((p): p is NonNullable<typeof p> => !!p),
    goingCount: parts.goingCount,
    faces: parts.faces.map(toPerson).filter((p): p is NonNullable<typeof p> => !!p),
    viewerGoing: !!parts.viewerRow,
    viewer: parts.viewerRow ? { showOnProfile: parts.viewerRow.showOnProfile, roles } : null,
    ...(parts.isEditor ? eventEditorFields(event) : {}),
  };
}

/**
 * What only the submitter and a directory admin read: the status, and every field the edit form fills, the private
 * contact data (host and co-host emails) included.
 */
export function eventEditorFields(event: PLEventDetailRow) {
  const details = assembleEventDetails(event.additionalInfo, event);
  const contacts = readEventContacts(event.privateDetails);
  const coHosts = contacts.coHosts.length
    ? contacts.coHosts
    : details.coHosts.map((coHost) => ({ name: coHost.name, email: null }));

  return {
    status: (event.status ?? 'APPROVED') as 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED',
    reviewNote: event.reviewNote ?? null,
    updatedAt: event.updatedAt ? new Date(event.updatedAt).toISOString() : undefined,
    logoUid: event.logoUid ?? null,
    bannerUid: event.bannerUid ?? null,
    format: details.format,
    accessOption: details.accessOption,
    tags: details.tags.map((tag) => tag.name),
    hostName: details.host?.name ?? null,
    hostEmail: contacts.hostEmail,
    coHosts,
    contactInfos: details.contactInfos ?? null,
    agenda: details.agenda,
    address: {
      address: event.venueAddress ?? null,
      city: contacts.address.city,
      state: contacts.address.state,
      country: contacts.address.country,
      latitude: event.latitude ?? null,
      longitude: event.longitude ?? null,
      locationUrl: details.locationUrl ?? null,
      locationInstructions: details.locationInstructions ?? null,
    },
    associations: (event.eventAssociations ?? []).map((link) => ({
      role: link.role,
      memberUid: link.memberUid,
      teamUid: link.teamUid,
    })),
  };
}

/**
 * Who may read an event by uid: anyone when it is approved; otherwise its submitter, and a directory admin unless
 * it is a draft (a draft is for its submitter only).
 */
export function eventReadAccess(
  event: { status?: string | null; submitterUid?: string | null },
  viewer: { uid: string; isDirectoryAdmin?: boolean | null } | null
): { canRead: boolean; isEditor: boolean } {
  const status = event.status ?? 'APPROVED';
  const isSubmitter = !!viewer && !!event.submitterUid && event.submitterUid === viewer.uid;
  const isAdmin = viewer?.isDirectoryAdmin === true;
  const isEditor = isSubmitter || (isAdmin && status !== 'DRAFT');
  return { canRead: status === 'APPROVED' || isEditor, isEditor };
}
