import { BadRequestException } from '@nestjs/common';
import { PLEventAccess, PLEventFormat, Prisma } from '@prisma/client';
import {
  PL_EVENT_LIST_DEFAULT_LIMIT,
  PL_EVENT_LIST_MAX_LIMIT,
  ResponsePLEventListItem,
} from 'libs/contracts/src/schema/pl-event-list';
import { isDateOnly, isDateTime } from 'libs/contracts/src/schema/pl-event-body';
import { cityOf, eventVenue, GUEST_PERSON_SELECT, hidesEventAttendance, listedGuestsWhereIn } from './pl-event-detail';
import { assembleEventDetails } from './pl-event-details.mapper';
import { VISIBLE_PL_EVENT_WHERE } from './pl-event-visibility';

/**
 * `GET /v1/irl/events` (LAB-3281): pure helpers that read the query, build the Prisma `where` and shape an item.
 * Kept out of the service so they can be tested without a database.
 */

export type EventListOptions = {
  page: number;
  limit: number;
  search?: string;
  cities?: string[];
  formats?: PLEventFormat[];
  accessOptions?: PLEventAccess[];
  tags?: string[];
  hosts?: string[];
  featured?: boolean;
  from?: Date;
  to?: Date;
  going?: boolean;
};

type RawQuery = Record<string, unknown> | undefined;

/** `?city=a&city=b` arrives as an array, `?city=a` as text. Empty values are dropped. */
function values(raw: unknown, name: string): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.some((item) => typeof item !== 'string')) {
    throw new BadRequestException(`${name} must be text`);
  }
  const trimmed = (list as string[]).map((item) => item.trim()).filter(Boolean);
  return trimmed.length ? [...new Set(trimmed)] : undefined;
}

function single(raw: unknown, name: string): string | undefined {
  const list = values(raw, name);
  if (list && list.length > 1) throw new BadRequestException(`${name} takes one value`);
  return list?.[0];
}

function intParam(raw: unknown, name: string, max: number): number | undefined {
  const text = single(raw, name);
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new BadRequestException(`${name} must be an integer from 1 to ${max}`);
  }
  return value;
}

function boolParam(raw: unknown, name: string): boolean | undefined {
  const text = single(raw, name);
  if (text === undefined) return undefined;
  if (text !== 'true' && text !== 'false') throw new BadRequestException(`${name} must be true or false`);
  return text === 'true';
}

function enumParams<T extends string>(raw: unknown, name: string, allowed: Record<string, T>): T[] | undefined {
  const list = values(raw, name);
  if (!list) return undefined;
  return list.map((item) => {
    if (!(item in allowed)) {
      throw new BadRequestException(`${name} must be one of ${Object.keys(allowed).join(', ')}`);
    }
    return allowed[item];
  });
}

/** A date-time, or a day. A day is its first instant for `from` and its last for `to` (UTC). */
function dateParam(raw: unknown, name: 'from' | 'to'): Date | undefined {
  const text = single(raw, name);
  if (text === undefined) return undefined;
  if (isDateOnly(text)) {
    return new Date(name === 'from' ? `${text}T00:00:00.000Z` : `${text}T23:59:59.999Z`);
  }
  if (isDateTime(text)) return new Date(text);
  throw new BadRequestException(`${name} must be a date (YYYY-MM-DD) or an ISO date-time with an offset`);
}

/** Reads the query; refuses a value it cannot honour instead of silently ignoring it. */
export function parseEventListQuery(query: RawQuery): EventListOptions {
  const from = dateParam(query?.from, 'from');
  const to = dateParam(query?.to, 'to');
  if (from && to && to < from) throw new BadRequestException('to is before from');

  const options: EventListOptions = {
    page: intParam(query?.page, 'page', Number.MAX_SAFE_INTEGER) ?? 1,
    limit: intParam(query?.limit, 'limit', PL_EVENT_LIST_MAX_LIMIT) ?? PL_EVENT_LIST_DEFAULT_LIMIT,
    search: single(query?.search, 'search'),
    cities: values(query?.city, 'city'),
    formats: enumParams(query?.format, 'format', PLEventFormat),
    accessOptions: enumParams(query?.accessOption, 'accessOption', PLEventAccess),
    tags: values(query?.tag, 'tag'),
    hosts: values(query?.host, 'host'),
    featured: boolParam(query?.featured, 'featured'),
    from,
    to,
    going: boolParam(query?.going, 'going'),
  };
  // Drop absent filters, so the options read as what was asked.
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as EventListOptions;
}

const insensitive = 'insensitive' as const;

/**
 * The `where` of the list. Different filters combine with AND; several values of one filter with OR. With no date
 * filter only events that have not ended are returned; `from` / `to` select the events that overlap that range,
 * ended ones included.
 */
export function eventListWhere(
  options: EventListOptions,
  now: Date,
  viewerUid: string | null
): Prisma.PLEventWhereInput {
  const and: Prisma.PLEventWhereInput[] = [];

  if (options.from || options.to) {
    if (options.from) and.push({ endDate: { gte: options.from } });
    if (options.to) and.push({ startDate: { lte: options.to } });
  } else {
    and.push({ endDate: { gte: now } });
  }

  if (options.search) {
    and.push({
      OR: [
        { name: { contains: options.search, mode: insensitive } },
        { hostName: { contains: options.search, mode: insensitive } },
      ],
    });
  }
  if (options.cities) {
    // A gathering is named "Lisbon, Portugal" or just "Lisbon".
    and.push({
      OR: options.cities.flatMap((city) => [
        { location: { location: { equals: city, mode: insensitive } } },
        { location: { location: { startsWith: `${city},`, mode: insensitive } } },
      ]),
    });
  }
  if (options.formats) and.push({ format: { in: options.formats } });
  if (options.accessOptions) and.push({ accessOption: { in: options.accessOptions } });
  if (options.tags) and.push({ tags: { hasSome: options.tags } });
  if (options.hosts) {
    and.push({ OR: options.hosts.map((host) => ({ hostName: { equals: host, mode: insensitive } })) });
  }
  if (options.featured !== undefined) {
    and.push(options.featured ? { isFeatured: true } : { NOT: { isFeatured: true } });
  }
  if (options.going && viewerUid) {
    and.push({ eventGuests: { some: { memberUid: viewerUid } } });
  }

  return { ...VISIBLE_PL_EVENT_WHERE, AND: and };
}

export const EVENT_LIST_SELECT = {
  uid: true,
  name: true,
  slugURL: true,
  type: true,
  startDate: true,
  endDate: true,
  isAllDay: true,
  timezone: true,
  format: true,
  accessOption: true,
  tags: true,
  isFeatured: true,
  hostName: true,
  venueAddress: true,
  latitude: true,
  longitude: true,
  externalId: true,
  websiteURL: true,
  locationUid: true,
  additionalInfo: true,
  logo: { select: { url: true } },
  banner: { select: { url: true } },
  location: { select: { uid: true, location: true, country: true, flag: true, timezone: true } },
};

export type EventListRow = {
  uid: string;
  name: string;
  slugURL: string;
  type: string | null;
  startDate: Date;
  endDate: Date;
  isAllDay: boolean;
  timezone: string | null;
  format: PLEventFormat | null;
  accessOption: PLEventAccess | null;
  tags: string[];
  isFeatured: boolean | null;
  hostName: string | null;
  venueAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  externalId: string | null;
  websiteURL: string | null;
  locationUid: string | null;
  additionalInfo?: unknown;
  logo: { url: string } | null;
  banner: { url: string } | null;
  location: {
    uid: string;
    location: string | null;
    country: string | null;
    flag: string | null;
    timezone: string | null;
  } | null;
};

/**
 * The list has cards for every viewer, so it follows the signed-out rule of the drawer and of the upcoming list: an
 * invite-only event (`type` INVITE_ONLY or `accessOption` INVITE) shows no going count and no faces.
 */
export function listHidesAttendance(event: { type: string | null; accessOption: string | null }): boolean {
  return hidesEventAttendance(event, false);
}

/**
 * The arguments of the one guest query that serves a whole page: a row per event and listed member, newest first.
 * `attendanceByEvent` turns the rows into a count and three faces per event.
 */
export function eventListGuestsFindArgs(eventUids: string[]) {
  return {
    where: listedGuestsWhereIn(eventUids),
    distinct: ['eventUid' as const, 'memberUid' as const],
    orderBy: { createdAt: 'desc' as const },
    select: { eventUid: true, memberUid: true, ...GUEST_PERSON_SELECT },
  };
}

type GuestRow = {
  eventUid: string | null;
  memberUid: string;
  member: { uid: string; name: string; image: { url: string } | null } | null;
};

export type EventAttendance = { goingCount: number; faces: Array<{ uid: string; name: string; image: string | null }> };

export const EVENT_LIST_FACES = 3;

/** Distinct listed members per event, with the newest three as faces. Rows arrive newest first. */
export function attendanceByEvent(rows: GuestRow[]): Map<string, EventAttendance> {
  const byEvent = new Map<string, EventAttendance>();
  for (const row of rows) {
    if (!row.eventUid) continue;
    const entry = byEvent.get(row.eventUid) ?? { goingCount: 0, faces: [] };
    entry.goingCount += 1;
    if (entry.faces.length < EVENT_LIST_FACES && row.member) {
      entry.faces.push({ uid: row.member.uid, name: row.member.name, image: row.member.image?.url ?? null });
    }
    byEvent.set(row.eventUid, entry);
  }
  return byEvent;
}

/** "Lisbon, Portugal" → "Portugal". Null when the gathering name has no second part. */
function countryOf(location: string | null | undefined): string | null {
  const parts = (location ?? '').split(',');
  const country = parts.length > 1 ? parts[parts.length - 1].trim() : '';
  return country || null;
}

export function toEventListItem(
  event: EventListRow,
  attendance: EventAttendance | undefined,
  isGoing: boolean
): ResponsePLEventListItem {
  const hidden = listHidesAttendance(event);
  const details = assembleEventDetails(event.additionalInfo, event);

  return {
    uid: event.uid,
    name: event.name,
    slugURL: event.slugURL,
    type: event.type ?? null,
    startDate: new Date(event.startDate).toISOString(),
    endDate: new Date(event.endDate).toISOString(),
    allDay: event.isAllDay === true,
    timezone: event.timezone ?? event.location?.timezone ?? null,
    format: event.format ?? null,
    accessOption: event.accessOption ?? null,
    tags: details.tags.map((tag) => tag.name),
    isFeatured: event.isFeatured === true,
    logo: event.logo?.url ?? null,
    banner: event.banner?.url ?? null,
    host: details.host,
    coHosts: details.coHosts.map((coHost) => ({ name: coHost.name })),
    gathering: event.location
      ? {
          uid: event.location.uid,
          city: cityOf(event.location.location),
          country: event.location.country?.trim() || countryOf(event.location.location),
        }
      : null,
    venue: eventVenue(event),
    goingCount: hidden ? null : attendance?.goingCount ?? 0,
    faces: hidden ? [] : attendance?.faces ?? [],
    isGoing,
    externalId: event.externalId ?? null,
    websiteUrl: event.websiteURL ?? null,
    location: event.location?.location ?? null,
    locationUid: event.locationUid ?? null,
    flag: event.location?.flag ?? null,
  };
}
