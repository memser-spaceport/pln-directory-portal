import type { Prisma } from '@prisma/client';
import {
  emptyPLEventDetails,
  PLEventDetails,
  PLEventDetailsAgenda,
  PLEventDetailsParty,
  PLEventDetailsTag,
} from 'libs/contracts/src/schema/pl-event-details';

/**
 * Event details from the PL events service, kept on `PLEvent.additionalInfo.details`
 * (LAB-3214, OpenSpec change `lab-3211-per-event-attendance`, design D7).
 *
 * Everything here is pure and tolerant: a field that does not have the expected
 * shape becomes empty (`null` or `[]`) and is reported through `onInvalid`, so one
 * odd field never fails the sync of an event.
 */

export const EVENT_DETAILS_KEY = 'details';

/** Reports a field that was present but could not be read. */
export type OnInvalidDetailsField = (field: keyof PLEventDetails, reason: string) => void;

const noop: OnInvalidDetailsField = () => undefined;

type Raw = Record<string, unknown>;

function isPlainObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  return value === null ? 'null' : typeof value;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readString(value: unknown, field: keyof PLEventDetails, onInvalid: OnInvalidDetailsField): string | null {
  if (isAbsent(value)) return null;
  if (typeof value !== 'string') {
    onInvalid(field, `expected a string, got ${describe(value)}`);
    return null;
  }
  return nonEmptyString(value);
}

function readTag(item: unknown): PLEventDetailsTag | null {
  if (typeof item === 'string') {
    const name = nonEmptyString(item);
    return name ? { name, color: null } : null;
  }
  if (isPlainObject(item)) {
    const name = nonEmptyString(item.name);
    return name ? { name, color: nonEmptyString(item.color) } : null;
  }
  return null;
}

function readTags(value: unknown, onInvalid: OnInvalidDetailsField): PLEventDetailsTag[] {
  if (isAbsent(value)) return [];
  if (!Array.isArray(value)) {
    onInvalid('tags', `expected an array, got ${describe(value)}`);
    return [];
  }
  const tags = value.map(readTag).filter((tag): tag is PLEventDetailsTag => tag !== null);
  if (tags.length < value.length) onInvalid('tags', `skipped ${value.length - tags.length} unreadable tag(s)`);
  return tags;
}

function readParty(item: unknown): PLEventDetailsParty | null {
  if (typeof item === 'string') {
    const name = nonEmptyString(item);
    return name ? { name, logo: null } : null;
  }
  if (isPlainObject(item)) {
    const name = nonEmptyString(item.name);
    return name ? { name, logo: nonEmptyString(item.logo) } : null;
  }
  return null;
}

function readParties(
  value: unknown,
  field: 'coHosts' | 'sponsors',
  onInvalid: OnInvalidDetailsField
): PLEventDetailsParty[] {
  if (isAbsent(value)) return [];
  if (!Array.isArray(value)) {
    onInvalid(field, `expected an array, got ${describe(value)}`);
    return [];
  }
  const parties = value.map(readParty).filter((party): party is PLEventDetailsParty => party !== null);
  if (parties.length < value.length) onInvalid(field, `skipped ${value.length - parties.length} unreadable item(s)`);
  return parties;
}

function readAgenda(value: unknown, onInvalid: OnInvalidDetailsField): PLEventDetailsAgenda | null {
  if (isAbsent(value)) return null;
  if (!isPlainObject(value)) {
    onInvalid('agenda', `expected an object, got ${describe(value)}`);
    return null;
  }
  const { sessions, ...rest } = value;
  if (!isAbsent(sessions) && !Array.isArray(sessions)) {
    onInvalid('agenda', `expected agenda.sessions to be an array, got ${describe(sessions)}`);
  }
  return { ...rest, sessions: Array.isArray(sessions) ? sessions : [] };
}

/**
 * Builds the details from one events-service event (snake_case payload, as both
 * the REST sync and the `events` queue receive it).
 */
export function mapEventDetails(raw: unknown, onInvalid: OnInvalidDetailsField = noop): PLEventDetails {
  if (!isPlainObject(raw)) return emptyPLEventDetails();

  const hostName = readString(raw.host, 'host', onInvalid);
  const hostLogo = nonEmptyString(raw.host_logo);

  return {
    tags: readTags(raw.tags, onInvalid),
    accessType: readString(raw.access_type, 'accessType', onInvalid),
    accessOption: readString(raw.access_option, 'accessOption', onInvalid),
    format: readString(raw.format, 'format', onInvalid),
    host: hostName ? { name: hostName, logo: hostLogo } : null,
    coHosts: readParties(raw.co_hosts, 'coHosts', onInvalid),
    sponsors: readParties(raw.sponsors, 'sponsors', onInvalid),
    agenda: readAgenda(raw.agenda, onInvalid),
  };
}

/**
 * Reads the stored details from `PLEvent.additionalInfo`. An event that was never
 * synced with details (or has no `additionalInfo`) reads as empty details.
 */
export function readEventDetails(additionalInfo: unknown): PLEventDetails {
  if (!isPlainObject(additionalInfo)) return emptyPLEventDetails();
  const stored = additionalInfo[EVENT_DETAILS_KEY];
  if (!isPlainObject(stored)) return emptyPLEventDetails();

  return {
    tags: readTags(stored.tags, noop),
    accessType: readString(stored.accessType, 'accessType', noop),
    accessOption: readString(stored.accessOption, 'accessOption', noop),
    format: readString(stored.format, 'format', noop),
    host: readParty(stored.host),
    coHosts: readParties(stored.coHosts, 'coHosts', noop),
    sponsors: readParties(stored.sponsors, 'sponsors', noop),
    agenda: readAgenda(stored.agenda, noop),
  };
}

/**
 * Returns `additionalInfo` with `details` replaced and every other key kept, ready
 * to write to `PLEvent.additionalInfo`.
 */
export function withEventDetails(additionalInfo: unknown, details: PLEventDetails): Prisma.InputJsonObject {
  const existing = isPlainObject(additionalInfo) ? additionalInfo : {};
  return { ...existing, [EVENT_DETAILS_KEY]: details } as Prisma.InputJsonObject;
}
