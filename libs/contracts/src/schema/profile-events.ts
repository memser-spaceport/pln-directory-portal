import { z } from 'zod';
import { PLEventPersonSchema, PLEventRoleSchema } from './pl-event-attendance';

/**
 * `GET /v1/members/:uid/events` and `GET /v1/teams/:uid/events` (LAB-3211 / LAB-3215).
 *
 * A leaf module on purpose: it imports only `zod` and the `pl-event-attendance` leaf, so specs can import these
 * schemas without the contracts barrel (see `job-search-status.ts`). `@Api` does not validate queries in this app, so
 * the controller `safeParse`s `ProfileEventsQuerySchema` itself.
 */

export const PROFILE_EVENTS_DEFAULT_LIMIT = 4;
export const PROFILE_EVENTS_MAX_LIMIT = 50;

/** Query strings arrive as text: "2" → 2. An empty value is left out, so the default applies. */
const intParam = (schema: z.ZodNumber) =>
  z.preprocess((value) => (value === undefined || value === '' ? undefined : Number(value)), schema.optional());

export const ProfileEventsQuerySchema = z.object({
  /** Return only this group, paged. Without it, both groups are returned. */
  group: z.enum(['upcoming', 'past']).optional(),
  page: intParam(z.number().int().min(1)),
  limit: intParam(z.number().int().min(1).max(PROFILE_EVENTS_MAX_LIMIT)),
});

/** The parsed query, defaults applied. */
export type ProfileEventsQuery = { group?: 'upcoming' | 'past'; page: number; limit: number };

/** The event fields every event card carries. */
const ProfileEventFieldsSchema = z.object({
  kind: z.literal('event'),
  uid: z.string(),
  name: z.string(),
  type: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  logo: z.string().nullable(),
  locationUid: z.string().nullable(),
  /** The gathering's name, e.g. "Berlin, Germany". */
  location: z.string().nullable(),
  /** `location` up to its first comma, e.g. "Berlin". */
  city: z.string().nullable(),
  /** `Host` / `Speaker` / `Sponsor`; empty for plain attendance. */
  roles: z.array(PLEventRoleSchema),
  /** Distinct going members the attendee list shows (REJECTED members left out), as on `GET /v1/irl/events/:uid`. */
  goingCount: z.number().int(),
  faces: z.array(PLEventPersonSchema),
  viewerGoing: z.boolean(),
});

export const MemberProfileEventSchema = ProfileEventFieldsSchema.extend({
  /** Always true for other viewers; the owner also sees their hidden events (false). */
  showOnProfile: z.boolean(),
});

/** A team's upcoming event: its current members going to it, plus the team's own roles. */
export const TeamProfileEventSchema = ProfileEventFieldsSchema.extend({
  memberCount: z.number().int(),
  members: z.array(PLEventPersonSchema),
});

/** A past event the team hosted, co-hosted, spoke at or sponsored (or was associated with as an attendee). */
export const TeamPastEventSchema = ProfileEventFieldsSchema;

/** A Demo Day the team took part in. It comes first among the team's past items. */
export const TeamProfileDemoDaySchema = z.object({
  kind: z.literal('demo-day'),
  uid: z.string(),
  title: z.string(),
  slug: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});

const group = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    page: z.number().int(),
    limit: z.number().int(),
    /** Every visible item in the group, for "Show all N". */
    total: z.number().int(),
    items: z.array(item),
  });

export const ResponseMemberEventsSchema = z.object({
  upcoming: group(MemberProfileEventSchema).optional(),
  past: group(MemberProfileEventSchema).optional(),
});

export const ResponseTeamEventsSchema = z.object({
  upcoming: group(TeamProfileEventSchema).optional(),
  past: group(z.union([TeamProfileDemoDaySchema, TeamPastEventSchema])).optional(),
});

export type MemberProfileEvent = z.infer<typeof MemberProfileEventSchema>;
export type TeamProfileEvent = z.infer<typeof TeamProfileEventSchema>;
export type TeamProfileDemoDay = z.infer<typeof TeamProfileDemoDaySchema>;
export type TeamPastEvent = z.infer<typeof TeamPastEventSchema>;
export type ProfileEventsGroup<T> = { page: number; limit: number; total: number; items: T[] };
export type ResponseMemberEvents = z.infer<typeof ResponseMemberEventsSchema>;
export type ResponseTeamEvents = z.infer<typeof ResponseTeamEventsSchema>;
