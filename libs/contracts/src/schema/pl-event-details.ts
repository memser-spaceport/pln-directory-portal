import { z } from 'zod';

/**
 * The details of one IRL event as the PL events service describes it: tags,
 * access, format, host, co-hosts, sponsors, agenda and the location link. Stored on
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

/**
 * True only for an absolute `http:` or `https:` URL. The events service checks
 * `location_url` with a loose regex, so the sync checks it again: any other
 * scheme (for example `javascript:`) must never reach a link on the page.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** True only for a time zone name the runtime knows, for example `America/Chicago`. */
export function isTimeZoneName(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const PLEventDetailsSchema = z.object({
  tags: z.array(PLEventDetailsTagSchema),
  accessType: z.string().nullable(),
  accessOption: z.string().nullable(),
  format: z.string().nullable(),
  host: PLEventDetailsPartySchema.nullable(),
  coHosts: z.array(PLEventDetailsPartySchema),
  sponsors: z.array(PLEventDetailsPartySchema),
  agenda: PLEventDetailsAgendaSchema.nullable(),
  /**
   * LAB-3332: the venue's map link, the events service's `location_url`. An
   * `http` or `https` URL, or null. Optional because details stored before
   * LAB-3332 do not have it; reads always return it (null when absent).
   */
  locationUrl: z.string().refine(isHttpUrl, 'expected an http or https URL').nullable().optional(),
  /**
   * LAB-3403: the event's own time zone (IANA name), or null. Optional because details stored before LAB-3403 do not
   * have it; reads always return it (null when absent).
   */
  timezone: z.string().refine(isTimeZoneName, 'expected an IANA time zone').nullable().optional(),
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
    locationUrl: null,
    timezone: null,
  };
}

/** Body of the internal `POST /v1/irl/events/sync`. Unknown keys are ignored. */
export const SyncPLEventsBodySchema = z.object({
  selectedEventUids: z.array(z.string()).optional(),
  detailsOnly: z.boolean().optional(),
});

export type SyncPLEventsBody = z.infer<typeof SyncPLEventsBodySchema>;
