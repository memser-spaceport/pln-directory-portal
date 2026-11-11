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

/** `GET /v1/irl/events/:uid`. `details` comes from the events sync (LAB-3214); empty for an event never resynced. */
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
  details: PLEventDetailsSchema,
  hosts: z.array(PLEventPersonSchema),
  goingCount: z.number().int(),
  faces: z.array(PLEventPersonSchema),
  viewerGoing: z.boolean(),
  /** The signed-in viewer's own attendance, or null when they are not going. */
  viewer: z
    .object({
      showOnProfile: z.boolean(),
      roles: z.array(PLEventRoleSchema),
    })
    .nullable(),
});

export type ResponsePLEventDetail = z.infer<typeof ResponsePLEventDetailSchema>;
