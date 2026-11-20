import { PLEventAccess, PLEventFormat } from '@prisma/client';
import { isIanaTimezone } from 'libs/contracts/src/schema/pl-event-body';
import { isHttpUrl } from 'libs/contracts/src/schema/pl-event-details';

/**
 * The typed `PLEvent` columns an events-service event fills (LAB-3281): time zone, format, access, tags, host name,
 * venue and links. Both sync paths and the details backfill write them through `mapEventColumns`, next to
 * `additionalInfo.details`, so the events list can filter and sort on them.
 *
 * Pure and tolerant, like `pl-event-details.mapper.ts`: a value that does not have the expected shape becomes null
 * (or an empty list) and never fails the sync of an event.
 */
export type PLEventTypedColumns = {
  timezone: string | null;
  format: PLEventFormat | null;
  accessOption: PLEventAccess | null;
  tags: string[];
  hostName: string | null;
  venueAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  registrationUrl: string | null;
  meetingUrl: string | null;
};

type Raw = Record<string, unknown>;

function isPlainObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** `IN-PERSON` (the events service's spelling), `in_person` and `In Person` all read as `IN_PERSON`. */
export function toEventFormat(value: unknown): PLEventFormat | null {
  const key = nonEmptyString(value)
    ?.toUpperCase()
    .replace(/[-\s]+/g, '_');
  return key && key in PLEventFormat ? PLEventFormat[key as keyof typeof PLEventFormat] : null;
}

export function toEventAccess(value: unknown): PLEventAccess | null {
  const key = nonEmptyString(value)?.toUpperCase();
  return key && key in PLEventAccess ? PLEventAccess[key as keyof typeof PLEventAccess] : null;
}

/** Tag names from plain strings or `{ name }` objects, in order, without duplicates. */
export function toEventTagNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value
    .map((item) => nonEmptyString(isPlainObject(item) ? item.name : item))
    .filter((name): name is string => name !== null);
  return [...new Set(names)];
}

function toHttpUrl(value: unknown): string | null {
  const url = nonEmptyString(value);
  return url && isHttpUrl(url) ? url : null;
}

function toCoordinate(value: unknown, limit: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

function toTimezone(value: unknown): string | null {
  const timezone = nonEmptyString(value);
  return timezone && isIanaTimezone(timezone) ? timezone : null;
}

/** Builds the typed columns from one events-service event (snake_case payload of the REST sync and the queue). */
export function mapEventColumns(raw: unknown): PLEventTypedColumns {
  const event = isPlainObject(raw) ? raw : {};
  const address = isPlainObject(event.address_info) ? event.address_info : {};

  return {
    timezone: toTimezone(event.timezone),
    format: toEventFormat(event.format),
    accessOption: toEventAccess(event.access_option),
    tags: toEventTagNames(event.tags),
    hostName: nonEmptyString(event.host),
    venueAddress: nonEmptyString(address.address),
    latitude: toCoordinate(address.latitude, 90),
    longitude: toCoordinate(address.longitude, 180),
    registrationUrl: toHttpUrl(event.registration_link),
    meetingUrl: toHttpUrl(event.meeting_link),
  };
}
