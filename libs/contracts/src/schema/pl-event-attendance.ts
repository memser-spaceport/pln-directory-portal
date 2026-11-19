import { z } from 'zod';
import { PLEventDetailsSchema } from './pl-event-details';

/**
 * Per-event attendance on the wire (LAB-3211 / LAB-3213).
 *
 * A leaf module on purpose: it imports only `zod` (and the `pl-event-details` leaf), so controller specs can import these schemas without pulling in
 * the contracts barrel (see `job-search-status.ts` for why that matters). `pl-event-guest.ts` builds its DTOs from it.
 *
 * `@Api` and the zod DTOs do not validate bodies in this app, so controllers `safeParse` these themselves.
 */

/**
 * "Not going" for one or more events. `events: [A]` deletes only A; `events: []` keeps its old meaning (every row the
 * member has at the gathering), which the admin attendee popup relies on. An entry without `events` is refused: until
 * LAB-3213 the contract said `{ memberUid, eventUid }`, and such a body silently deleted everything.
 */
export const DeletePLEventGuestsSchema = z.object({
  membersAndEvents: z
    .array(
      z.object({
        memberUid: z.string().min(1),
        events: z.array(z.string()),
      })
    )
    .min(1),
});

/** `PATCH /v1/irl/events/:uid/me`: show or hide the caller's attendance on their profile. */
export const UpdateMyEventVisibilitySchema = z.object({
  showOnProfile: z.boolean(),
});

const SubEventSchema = z.object({
  name: z.string(),
  link: z.string().url(),
});

/**
 * `PATCH /v1/irl/locations/:uid/guests/me`: the caller's plans at a gathering, updated in place.
 * Shared fields go to every row the caller has at the gathering; each `events[]` entry sets the roles on the caller's
 * existing row for that event. Never creates or deletes rows, never touches `showOnProfile`.
 */
export const UpdateMyGuestPlansSchema = z.object({
  teamUid: z.string().nullable().optional(),
  topics: z.array(z.string()).optional(),
  reason: z.string().nullable().optional(),
  telegramId: z.string().nullable().optional(),
  officeHours: z.string().nullable().optional(),
  additionalInfo: z
    .object({
      checkInDate: z.string().nullable().optional(),
      checkOutDate: z.string().nullable().optional(),
    })
    .optional(),
  events: z
    .array(
      z.object({
        uid: z.string().min(1),
        isHost: z.boolean().optional(),
        isSpeaker: z.boolean().optional(),
        isSponsor: z.boolean().optional(),
        hostSubEvents: z.array(SubEventSchema).optional(),
        speakerSubEvents: z.array(SubEventSchema).optional(),
        sponsorSubEvents: z.array(SubEventSchema).optional(),
      })
    )
    .optional(),
});

/** A member shown on an event: a host or one of the faces. */
export const PLEventPersonSchema = z.object({
  uid: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

export const PLEventRoleSchema = z.enum(['Host', 'Speaker', 'Sponsor']);

/** `GET /v1/irl/events/:uid`. `details` joins the event's typed columns and its stored details; empty for an event with none. */
export const ResponsePLEventDetailSchema = z.object({
  uid: z.string(),
  name: z.string(),
  slugURL: z.string(),
  type: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  description: z.string().nullable(),
  shortDescription: z.string().nullable(),
  logo: z.string().nullable(),
  banner: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  externalId: z.string().nullable(),
  resources: z.array(z.any()),
  location: z
    .object({
      uid: z.string(),
      location: z.string(),
      /** `location` up to the first comma. */
      city: z.string().nullable(),
      flag: z.string().nullable(),
      timezone: z.string().nullable(),
      resources: z.array(z.any()),
      /** The gathering's other events the viewer may see (deleted and, for signed-out viewers, invite-only left out). */
      events: z.array(
        z.object({
          uid: z.string(),
          name: z.string(),
          type: z.string().nullable(),
          startDate: z.string(),
          endDate: z.string(),
        })
      ),
    })
    .nullable(),
  /** IANA name. The event's own time zone, or its gathering's when the event has none. */
  timezone: z.string().nullable(),
  /** True when the dates carry no time of day. */
  allDay: z.boolean(),
  /** Null when the event has no venue address and no position. */
  venue: z
    .object({ address: z.string().nullable(), latitude: z.number().nullable(), longitude: z.number().nullable() })
    .nullable(),
  registrationUrl: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  details: PLEventDetailsSchema,
  hosts: z.array(PLEventPersonSchema),
  goingCount: z.number().int(),
  faces: z.array(PLEventPersonSchema),
  viewerGoing: z.boolean(),
  /**
   * The fields below are returned only to the member who submitted the event and to a directory admin: the status
   * and what the edit form fills. Other viewers get none of them.
   */
  status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
  reviewNote: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
  logoUid: z.string().nullable().optional(),
  bannerUid: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  accessOption: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  hostName: z.string().nullable().optional(),
  hostEmail: z.string().nullable().optional(),
  coHosts: z.array(z.object({ name: z.string(), email: z.string().nullable() })).optional(),
  contactInfos: z.record(z.array(z.string())).nullable().optional(),
  agenda: z.any().optional(),
  address: z
    .object({
      address: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      country: z.string().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      locationUrl: z.string().nullable(),
      locationInstructions: z.string().nullable(),
    })
    .optional(),
  associations: z
    .array(z.object({ role: z.string(), memberUid: z.string().nullable(), teamUid: z.string().nullable() }))
    .optional(),
  /** The signed-in viewer's own attendance, or null when they are not going. */
  viewer: z
    .object({
      showOnProfile: z.boolean(),
      roles: z.array(PLEventRoleSchema),
    })
    .nullable(),
});

export type ResponsePLEventDetail = z.infer<typeof ResponsePLEventDetailSchema>;
