import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

const TRACK_EVENT_NAME_MAX = 200;

const TrackPropertiesSchema = z.record(z.string(), z.unknown());

const TrackEventItemSchema = z.object({
  event: z.string().trim().max(TRACK_EVENT_NAME_MAX).optional(),
  properties: TrackPropertiesSchema.optional(),
});

/**
 * Body posted by a deployed AI App to `POST /v1/ai-apps/track` (single event
 * via `event`/`properties`, or a small batch via `events`). Deliberately
 * permissive — attribution, identity, size, and batch-limit checks all live
 * in `AiAppsService.trackAppEvent` and silently drop the request (still 204)
 * instead of 400ing, so a scripted caller gets no signal about which check it
 * hit. Only structurally wrong JSON (wrong field types) 400s here.
 */
export const TrackEventSchema = z.object({
  event: z.string().trim().max(TRACK_EVENT_NAME_MAX).optional(),
  properties: TrackPropertiesSchema.optional(),
  events: z.array(TrackEventItemSchema).optional(),
  anonId: z.string().max(200).optional(),
});

export class TrackEventDto extends createZodDto(TrackEventSchema) {}
