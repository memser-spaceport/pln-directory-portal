import { BadRequestException } from '@nestjs/common';

/**
 * Optional narrowing of `GET /v1/irl/events/upcoming` (LAB-3071, for Home's events rail). With none of these the
 * endpoint answers as it always has: every upcoming event, `startDate` descending.
 */
export type UpcomingEventsOptions = {
  /** Only events starting within this many days from now. */
  days?: number;
  /** At most this many events; the response then carries the full count in `X-Total-Count`. */
  limit?: number;
  /** `soonest`: `startDate` ascending. */
  sort?: 'soonest';
};

export const UPCOMING_EVENTS_MAX_DAYS = 365;
export const UPCOMING_EVENTS_MAX_LIMIT = 50;

function positiveInt(raw: unknown, name: string, max: number): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new BadRequestException(`${name} must be an integer from 1 to ${max}`);
  }
  return value;
}

/** Reads the query; refuses values it can't honour instead of silently ignoring them. */
export function parseUpcomingEventsQuery(query: Record<string, unknown> | undefined): UpcomingEventsOptions {
  const days = positiveInt(query?.days, 'days', UPCOMING_EVENTS_MAX_DAYS);
  const limit = positiveInt(query?.limit, 'limit', UPCOMING_EVENTS_MAX_LIMIT);
  const sort = query?.sort;
  if (sort !== undefined && sort !== '' && sort !== 'soonest') {
    throw new BadRequestException('sort must be "soonest"');
  }
  return {
    ...(days !== undefined ? { days } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(sort === 'soonest' ? { sort: 'soonest' as const } : {}),
  };
}

/** The Prisma `findMany` arguments for these options, minus `select` (the service owns the shape). */
export function upcomingEventsFindArgs(options: UpcomingEventsOptions, now: Date) {
  const where = {
    startDate: {
      gt: now,
      ...(options.days ? { lte: new Date(now.getTime() + options.days * 24 * 60 * 60 * 1000) } : {}),
    },
    isDeleted: false,
  };
  return {
    where,
    orderBy: { startDate: options.sort === 'soonest' ? ('asc' as const) : ('desc' as const) },
    ...(options.limit ? { take: options.limit } : {}),
  };
}

type UpcomingEventRow = {
  uid: string;
  name: string;
  websiteURL: string | null;
  startDate: Date;
  endDate: Date;
  logo: { url: string } | null;
  location: { location: string | null; flag: string | null } | null;
};

/** One row as the endpoint has always answered it. */
export function toUpcomingEvent(event: UpcomingEventRow) {
  return {
    uid: event.uid,
    name: event.name,
    websiteUrl: event.websiteURL ?? null,
    logo: event.logo?.url ?? null,
    location: event.location?.location ?? null,
    flag: event.location?.flag ?? null,
    startDate: new Date(event.startDate).toISOString(),
    endDate: new Date(event.endDate).toISOString(),
  };
}
