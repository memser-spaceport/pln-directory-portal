import { z } from 'zod';
import { PLEventBodyFieldsSchema, PLEventStatusSchema } from './pl-event-body';

/**
 * The curation API for partner apps, `/v1/integrations/events` (LAB-3326). A leaf module: it imports only `zod`
 * and the `pl-event-body` leaf. The event bodies themselves are `PLEventPartnerBodySchema` and
 * `PLEventPartnerPatchBodySchema` in `pl-event-body.ts`.
 */

export const PL_EVENT_CURATION_DEFAULT_LIMIT = 50;
export const PL_EVENT_CURATION_MAX_LIMIT = 100;
export const PL_EVENT_CURATION_BATCH_MAX = 100;

/** The statuses a partner app reads. Drafts are for their submitter only. */
export const PLEventCurationStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

/** The caller's own id of an event. With the key's team it identifies the event. */
export const PLEventExternalIdSchema = z.string().trim().min(1).max(200);

export const PLEventDecisionBodySchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  /** Stored with the decision, for example why the event was rejected. */
  note: z.string().trim().max(2000).nullish(),
});
export type PLEventDecisionBody = z.infer<typeof PLEventDecisionBodySchema>;

/** One event of a batch: the event body plus the caller's id. Each item is checked on its own. */
export const PLEventBatchBodySchema = z.object({
  events: z.array(z.unknown()).min(1).max(PL_EVENT_CURATION_BATCH_MAX),
});

export const PLEventUpsertResultSchema = z.object({
  uid: z.string(),
  externalId: z.string(),
  result: z.enum(['created', 'updated']),
  status: PLEventStatusSchema,
});
export type PLEventUpsertResult = z.infer<typeof PLEventUpsertResultSchema>;

export const PLEventBatchItemResultSchema = z.union([
  PLEventUpsertResultSchema,
  z.object({
    externalId: z.string().nullable(),
    result: z.literal('error'),
    /** Why the event was not stored. */
    error: z.string(),
  }),
]);
export type PLEventBatchItemResult = z.infer<typeof PLEventBatchItemResultSchema>;

/** One event as a partner app reads it: every event field, its status, and who submitted it. */
export const PLEventCurationItemSchema = z.object({
  uid: z.string(),
  status: PLEventCurationStatusSchema,
  /** The id of the app that published the event; null for an event a person submitted in LabOS. */
  externalId: z.string().nullable(),
  /** True when the calling key's team published this event. Only such an event can be deleted with the key. */
  createdByYourTeam: z.boolean(),
  /** The member who submitted the event in LabOS; null for a partner event and for an event from before LabOS submissions. */
  submitter: z.object({ memberUid: z.string(), name: z.string().nullable(), email: z.string().nullable() }).nullable(),
  reviewedAt: z.string().nullable(),
  reviewNote: z.string().nullable(),
  name: z.string(),
  slugURL: z.string(),
  description: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  allDay: z.boolean(),
  timezone: z.string().nullable(),
  format: PLEventBodyFieldsSchema.shape.format,
  accessOption: PLEventBodyFieldsSchema.shape.accessOption,
  tags: z.array(z.string()),
  isFeatured: z.boolean(),
  hostName: z.string().nullable(),
  hostEmail: z.string().nullable(),
  coHosts: z.array(z.object({ name: z.string(), email: z.string().nullable() })),
  websiteUrl: z.string().nullable(),
  registrationUrl: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  locationUrl: z.string().nullable(),
  contactInfos: z.record(z.array(z.string())).nullable(),
  agenda: z.any().nullable(),
  address: z.object({
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    country: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    locationInstructions: z.string().nullable(),
  }),
  /** The LabOS gathering the event belongs to, resolved from the city. Null for an event with none. */
  gathering: z.object({ uid: z.string(), name: z.string() }).nullable(),
  logoUid: z.string().nullable(),
  logo: z.string().nullable(),
  associations: z.array(
    z.object({ role: z.string(), memberUid: z.string().nullable(), teamUid: z.string().nullable() })
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PLEventCurationItem = z.infer<typeof PLEventCurationItemSchema>;

export const PLEventCurationListSchema = z.object({
  items: z.array(PLEventCurationItemSchema),
  /** Pass it as `cursor` to read the next page. Null on the last page. */
  nextCursor: z.string().nullable(),
});
export type PLEventCurationList = z.infer<typeof PLEventCurationListSchema>;
