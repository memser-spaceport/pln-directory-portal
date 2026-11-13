import { z } from 'zod';

/**
 * The details of one IRL event as the PL events service describes it: tags,
 * access, format, host, co-hosts, sponsors and agenda. Stored on
 * `PLEvent.additionalInfo.details` by both event sync paths (LAB-3214).
 *
 * **A leaf module on purpose.** It imports only `zod`, so jest specs can import
 * it without pulling `nestjs-zod/z` (ESM) in through the schema barrel. Same
 * reason as `job-search-status.ts`. `pl-event.ts` re-exports it.
 *
 * The events service sends tags as plain strings; it has no tag colours (the PL
 * events app derives them on the client). `color` is kept for a source that
 * does send one and is otherwise `null`.
 */
export const PLEventDetailsPartySchema = z.object({
  name: z.string(),
  logo: z.string().nullable(),
});

export const PLEventDetailsTagSchema = z.object({
  name: z.string(),
  color: z.string().nullable(),
});

export const PLEventDetailsAgendaSchema = z
  .object({
    sessions: z.array(z.unknown()),
  })
  .passthrough();

export const PLEventDetailsSchema = z.object({
  tags: z.array(PLEventDetailsTagSchema),
  accessType: z.string().nullable(),
  accessOption: z.string().nullable(),
  format: z.string().nullable(),
  host: PLEventDetailsPartySchema.nullable(),
  coHosts: z.array(PLEventDetailsPartySchema),
  sponsors: z.array(PLEventDetailsPartySchema),
  agenda: PLEventDetailsAgendaSchema.nullable(),
});

export type PLEventDetailsParty = z.infer<typeof PLEventDetailsPartySchema>;
export type PLEventDetailsTag = z.infer<typeof PLEventDetailsTagSchema>;
export type PLEventDetailsAgenda = z.infer<typeof PLEventDetailsAgendaSchema>;
export type PLEventDetails = z.infer<typeof PLEventDetailsSchema>;

/** What an event that was never synced with details (or sent none) reads as. */
export function emptyPLEventDetails(): PLEventDetails {
  return {
    tags: [],
    accessType: null,
    accessOption: null,
    format: null,
    host: null,
    coHosts: [],
    sponsors: [],
    agenda: null,
  };
}

/** Body of the internal `POST /v1/irl/events/sync`. Unknown keys are ignored. */
export const SyncPLEventsBodySchema = z.object({
  selectedEventUids: z.array(z.string()).optional(),
  detailsOnly: z.boolean().optional(),
});

export type SyncPLEventsBody = z.infer<typeof SyncPLEventsBodySchema>;
