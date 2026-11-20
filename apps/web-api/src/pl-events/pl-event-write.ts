import { randomBytes } from 'crypto';
import { PLEventAccess, PLEventFormat, PLEventStatus, PLEventType, Prisma } from '@prisma/client';
import moment from 'moment-timezone';
import sanitizeHtml from 'sanitize-html';
import { isDateOnly, PLEventBodyFields } from 'libs/contracts/src/schema/pl-event-body';
import type { PLEventDetails } from 'libs/contracts/src/schema/pl-event-details';
import { EVENT_DETAILS_KEY, readEventDetails } from './pl-event-details.mapper';

/**
 * Pure helpers of the event write path (LAB-3325): who the caller is, which status a new event gets, the derived
 * `type`, the slug, the description sanitizer, the dates and the stored shape. `PLEventWriteService` does the
 * database work with them.
 */

/**
 * Who writes the event. One write path serves all of them:
 *
 * | Actor | Status on create | May edit | May delete |
 * |---|---|---|---|
 * | member with `forum.write`, or directory admin | `APPROVED` | own (admin: any) | own (admin: any) |
 * | other member | `PENDING` | own | own, until approved |
 * | integration key with `events:write` | `APPROVED` | any | events of its team |
 */
export type EventActor =
  | { kind: 'member'; memberUid: string; trusted: boolean; isAdmin: boolean }
  | { kind: 'integration'; teamUid: string };

/** The status a new submission gets. The caller never chooses it. */
export function statusOnSubmit(actor: EventActor): PLEventStatus {
  if (actor.kind === 'integration') return PLEventStatus.APPROVED;
  if (actor.kind === 'member' && (actor.trusted || actor.isAdmin)) return PLEventStatus.APPROVED;
  return PLEventStatus.PENDING;
}

/**
 * `PLEvent.type`, which the invite-only rules of attendance read. Derived on every write: an invite event is
 * `INVITE_ONLY`, a virtual one `VIRTUAL`, anything else `IN_PERSON`.
 */
export function deriveEventType(
  format: PLEventFormat | null | undefined,
  accessOption: PLEventAccess | null | undefined
): PLEventType {
  if (accessOption === PLEventAccess.INVITE) return PLEventType.INVITE_ONLY;
  if (format === PLEventFormat.VIRTUAL) return PLEventType.VIRTUAL;
  return PLEventType.IN_PERSON;
}

const SLUG_SUFFIX_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function randomSuffix(length = 6): string {
  return Array.from(randomBytes(length), (byte) => SLUG_SUFFIX_ALPHABET[byte % SLUG_SUFFIX_ALPHABET.length]).join('');
}

/** `Lisbon Builders Night` → `lisbon-builders-night-x7k2mq`. The random suffix keeps two events with one name apart. */
export function eventSlug(name: string, suffix: string = randomSuffix()): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `${base || 'event'}-${suffix}`;
}

const DESCRIPTION_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'ul',
    'ol',
    'li',
    'a',
    'blockquote',
    'span',
    'div',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    '*': ['style'],
  },
  // Alignment is the only style the editor writes.
  allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/] } },
  allowedSchemes: ['http', 'https'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

/**
 * Keeps text formatting only: paragraphs, headings, bold, italic, underline, strikethrough, lists, alignment, line
 * breaks and `http` / `https` links. Every other tag and attribute is dropped. Runs on every write.
 */
export function sanitizeEventDescription(description: string | null | undefined): string | null {
  if (description === null || description === undefined) return null;
  const clean = sanitizeHtml(description, DESCRIPTION_SANITIZE_OPTIONS).trim();
  return clean || null;
}

/** The instant of a body date: a date-time as it is, a day as its first or last instant in the event's time zone. */
export function resolveEventDate(value: string, edge: 'start' | 'end', timezone: string): Date {
  if (!isDateOnly(value)) return new Date(value);
  const day = moment.tz(value, 'YYYY-MM-DD', true, timezone);
  return (edge === 'start' ? day.startOf('day') : day.endOf('day')).toDate();
}

type Party = { name: string; logo: string | null };

/**
 * `PLEvent.privateDetails`: contact data returned only to the submitter and a directory admin. It is a column of
 * its own, not a key of `additionalInfo`, because several older reads return `additionalInfo` as it is.
 */
export type EventContacts = {
  hostEmail: string | null;
  /** Co-hosts as the form sent them, with their emails. */
  coHosts: Array<{ name: string; email: string | null }>;
  /** The address parts the gathering was resolved from. */
  address: { city: string | null; state: string | null; country: string | null };
};

export function emptyEventContacts(): EventContacts {
  return { hostEmail: null, coHosts: [], address: { city: null, state: null, country: null } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function readEventContacts(stored: unknown): EventContacts {
  if (!isPlainObject(stored)) return emptyEventContacts();
  const address = isPlainObject(stored.address) ? stored.address : {};
  return {
    hostEmail: text(stored.hostEmail),
    coHosts: Array.isArray(stored.coHosts)
      ? stored.coHosts
          .filter(isPlainObject)
          .map((item) => ({ name: text(item.name) ?? '', email: text(item.email) }))
          .filter((item) => item.name)
      : [],
    address: { city: text(address.city), state: text(address.state), country: text(address.country) },
  };
}

/** A body value: `undefined` keeps what is stored, `null` clears it. */
function pick<T>(incoming: T | null | undefined, stored: T): T | null {
  return incoming === undefined ? stored : incoming;
}

/** The typed columns and JSON a body writes, merged over what the event already has (an edit sends a subset). */
export type EventStoredFields = {
  description: string | null;
  format: PLEventFormat | null;
  accessOption: PLEventAccess | null;
  tags: string[];
  hostName: string | null;
  venueAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  registrationUrl: string | null;
  meetingUrl: string | null;
  websiteURL: string | null;
  logoUid: string | null;
  bannerUid: string | null;
  additionalInfo: unknown;
  privateDetails: unknown;
};

type EventBodyPatch = Partial<PLEventBodyFields>;

/**
 * The `data` of an event write, without the dates, the gathering and the status (the service owns those).
 * `additionalInfo.details` holds the public part that is not a column; `privateDetails` the private part.
 */
export function eventWriteData(
  body: EventBodyPatch,
  stored: EventStoredFields | null
): Omit<EventStoredFields, 'additionalInfo' | 'privateDetails'> & {
  type: PLEventType;
  resources: Prisma.InputJsonValue[];
  additionalInfo: Prisma.InputJsonObject;
  privateDetails: Prisma.InputJsonObject;
} {
  const details = readEventDetails(stored?.additionalInfo);
  const contacts = readEventContacts(stored?.privateDetails);
  const address = body.address;

  const format = pick(body.format, stored?.format ?? null);
  const accessOption = pick(body.accessOption, stored?.accessOption ?? null);
  const tags = [...new Set(pick(body.tags, stored?.tags ?? []) ?? [])];
  const hostName = text(pick(body.hostName, stored?.hostName ?? null));
  const registrationUrl = pick(body.registrationUrl, stored?.registrationUrl ?? null);
  const websiteURL = pick(body.websiteUrl, stored?.websiteURL ?? null);

  const coHosts =
    body.coHosts === undefined
      ? contacts.coHosts
      : (body.coHosts ?? []).map((coHost) => ({ name: coHost.name, email: coHost.email ?? null }));
  const coHostParties: Party[] =
    body.coHosts === undefined
      ? details.coHosts
      : coHosts.map((coHost) => ({
          name: coHost.name,
          logo: details.coHosts.find((party) => party.name === coHost.name)?.logo ?? null,
        }));

  const nextDetails: PLEventDetails & Record<string, unknown> = {
    ...details,
    tags: tags.map((name) => ({ name, color: details.tags.find((tag) => tag.name === name)?.color ?? null })),
    format,
    accessOption,
    host: hostName ? { name: hostName, logo: details.host?.logo ?? null } : null,
    coHosts: coHostParties,
    agenda: body.agenda === undefined ? details.agenda : body.agenda ? { ...body.agenda } : null,
    locationUrl: pick(body.locationUrl, details.locationUrl ?? null),
    contactInfos: pick(body.contactInfos, details.contactInfos ?? null),
    locationInstructions:
      address === undefined
        ? details.locationInstructions ?? null
        : address === null
        ? null
        : pick(address.locationInstructions, details.locationInstructions ?? null),
  };

  const nextContacts: EventContacts = {
    hostEmail: pick(body.hostEmail, contacts.hostEmail),
    coHosts,
    address:
      address === undefined
        ? contacts.address
        : address === null
        ? emptyEventContacts().address
        : {
            city: text(pick(address.city, contacts.address.city)),
            state: text(pick(address.state, contacts.address.state)),
            country: text(pick(address.country, contacts.address.country)),
          },
  };

  const existing = isPlainObject(stored?.additionalInfo) ? stored?.additionalInfo ?? {} : {};
  // The drawer and the older event reads show links from `resources`, as the events sync wrote them.
  const resources: Prisma.InputJsonValue[] = [];
  if (registrationUrl) resources.push({ name: 'Registration', description: 'Registration URL', link: registrationUrl });
  if (websiteURL) resources.push({ name: 'Website', description: 'Website URL', link: websiteURL });

  return {
    description:
      body.description === undefined ? stored?.description ?? null : sanitizeEventDescription(body.description),
    type: deriveEventType(format, accessOption),
    format,
    accessOption,
    tags,
    hostName,
    venueAddress:
      address === undefined
        ? stored?.venueAddress ?? null
        : address === null
        ? null
        : text(pick(address.address, stored?.venueAddress ?? null)),
    latitude:
      address === undefined
        ? stored?.latitude ?? null
        : address === null
        ? null
        : pick(address.latitude, stored?.latitude ?? null),
    longitude:
      address === undefined
        ? stored?.longitude ?? null
        : address === null
        ? null
        : pick(address.longitude, stored?.longitude ?? null),
    registrationUrl,
    meetingUrl: pick(body.meetingUrl, stored?.meetingUrl ?? null),
    websiteURL,
    logoUid: pick(body.logoUid, stored?.logoUid ?? null),
    bannerUid: pick(body.bannerUid, stored?.bannerUid ?? null),
    resources,
    additionalInfo: { ...existing, [EVENT_DETAILS_KEY]: nextDetails } as unknown as Prisma.InputJsonObject,
    privateDetails: nextContacts as unknown as Prisma.InputJsonObject,
  };
}

/** Association role → the guest flags of a named member, as the events sync set them. */
export function guestFlagsOfRole(role: string): { isHost: boolean; isSpeaker: boolean; isSponsor: boolean } {
  return {
    isHost: role === 'HOST' || role === 'CO_HOST',
    isSpeaker: role === 'SPEAKER',
    isSponsor: role === 'SPONSOR',
  };
}
