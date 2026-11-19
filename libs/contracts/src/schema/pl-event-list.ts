import { z } from 'zod';
import { PLEventAccessSchema, PLEventFormatSchema } from './pl-event-body';
import { PLEventPersonSchema } from './pl-event-attendance';

/**
 * `GET /v1/irl/events` (LAB-3281): approved events with search, filters and paging, for the All Events page in its
 * list, calendar and map views.
 *
 * A leaf module on purpose: it imports only `zod` and other leaves (see `job-search-status.ts`). `@Api` does not
 * validate queries in this app, so the controller parses the query itself (`parseEventListQuery`).
 */

export const PL_EVENT_LIST_DEFAULT_LIMIT = 50;
export const PL_EVENT_LIST_MAX_LIMIT = 100;

/** One value or several: `?city=Lisbon&city=Denver`. An event matches when it has any one of them. */
const many = <T extends z.ZodTypeAny>(schema: T) => z.union([schema, z.array(schema)]).optional();

/** The query as it arrives (text). Documented here; parsed by `parseEventListQuery`. */
export const PLEventListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  /** Matched on the event name and the host name, ignoring case. */
  search: z.string().optional(),
  /** The gathering's city, for example `Lisbon`. */
  city: many(z.string()),
  format: many(PLEventFormatSchema),
  accessOption: many(PLEventAccessSchema),
  tag: many(z.string()),
  /** The host name. */
  host: many(z.string()),
  featured: z.enum(['true', 'false']).optional(),
  /** Events that overlap `from`..`to`, ended events included. A date (`2026-07-01`) or a date-time. */
  from: z.string().optional(),
  to: z.string().optional(),
  /** `true`: only the events the signed-in member is going to. 401 without a user token. */
  going: z.enum(['true', 'false']).optional(),
});

export const ResponsePLEventListItemSchema = z.object({
  uid: z.string(),
  name: z.string(),
  slugURL: z.string(),
  /** `INVITE_ONLY`, `VIRTUAL` or `IN_PERSON`, as on the other event reads. */
  type: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  /** True when the dates carry no time of day. */
  allDay: z.boolean(),
  /** IANA name. The event's own time zone, or its gathering's when the event has none. */
  timezone: z.string().nullable(),
  format: PLEventFormatSchema.nullable(),
  accessOption: PLEventAccessSchema.nullable(),
  tags: z.array(z.string()),
  isFeatured: z.boolean(),
  logo: z.string().nullable(),
  banner: z.string().nullable(),
  host: z.object({ name: z.string(), logo: z.string().nullable() }).nullable(),
  /** Co-host names, so a host filter on the client can match them. */
  coHosts: z.array(z.object({ name: z.string() })),
  /** The gathering the event belongs to. Null for an event with none (a virtual event). */
  gathering: z.object({ uid: z.string(), city: z.string().nullable(), country: z.string().nullable() }).nullable(),
  /** Null when the event has no venue address and no position. */
  venue: z
    .object({ address: z.string().nullable(), latitude: z.number().nullable(), longitude: z.number().nullable() })
    .nullable(),
  /** Distinct listed members who go, as on the event drawer. Null for an invite-only event. */
  goingCount: z.number().int().nullable(),
  /** Up to 3 members who go, newest first. Empty for an invite-only event. */
  faces: z.array(PLEventPersonSchema),
  /** Whether the signed-in viewer goes. Always false for a signed-out viewer. */
  isGoing: z.boolean(),
  // The fields of the upcoming-events list, so a client can move from it without a second request.
  /** The events calendar id of an event that came from the events service. */
  externalId: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  /** The gathering's name, for example "Lisbon, Portugal". */
  location: z.string().nullable(),
  locationUid: z.string().nullable(),
  flag: z.string().nullable(),
});

export const ResponsePLEventListSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  items: z.array(ResponsePLEventListItemSchema),
});

export type ResponsePLEventListItem = z.infer<typeof ResponsePLEventListItemSchema>;
export type ResponsePLEventList = z.infer<typeof ResponsePLEventListSchema>;
