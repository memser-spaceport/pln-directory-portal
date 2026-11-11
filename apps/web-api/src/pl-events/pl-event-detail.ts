import type { ResponsePLEventDetail } from 'libs/contracts/src/schema/pl-event-attendance';

/**
 * `GET /v1/irl/events/:uid` (LAB-3213): pure helpers that turn the rows `PLEventsService.getPLEventDetail` loads into
 * the response. Kept out of the service so they can be tested without Prisma.
 */

/**
 * The event details synced from the PL events service. LAB-3214 fills them from `additionalInfo.details`; until an
 * event is resynced every field is empty, never missing.
 */
export function emptyPLEventDetails() {
  return {
    tags: [] as Array<{ name: string; color: string | null }>,
    accessType: null as string | null,
    accessOption: null as string | null,
    format: null as string | null,
    host: null as { name: string; logo: string | null } | null,
    coHosts: [] as Array<{ name: string; logo: string | null }>,
    sponsors: [] as Array<{ name: string; logo: string | null }>,
    agenda: null as Record<string, unknown> | null,
  };
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
  details?: ResponsePLEventDetail['details'];
};

function toPerson(row: PersonRow) {
  return row ? { uid: row.uid, name: row.name, image: row.image?.url ?? null } : null;
}

/** Private resources are for signed-in viewers only, as on the other event reads. */
export function visibleResources(resources: unknown[] | null | undefined, isUserLoggedIn: boolean): unknown[] {
  const list = Array.isArray(resources) ? resources : [];
  return isUserLoggedIn ? list : list.filter((resource: any) => !resource?.isPrivate);
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
    details: parts.details ?? emptyPLEventDetails(),
    hosts: parts.hosts.map(toPerson).filter((p): p is NonNullable<typeof p> => !!p),
    goingCount: parts.goingCount,
    faces: parts.faces.map(toPerson).filter((p): p is NonNullable<typeof p> => !!p),
    viewerGoing: !!parts.viewerRow,
    viewer: parts.viewerRow ? { showOnProfile: parts.viewerRow.showOnProfile, roles } : null,
  };
}
