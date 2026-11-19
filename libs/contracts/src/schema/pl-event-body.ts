import { z } from 'zod';
import { isHttpUrl } from './pl-event-details';

/**
 * The body of an event write, shared by the member routes (`POST` and `PATCH /v1/irl/events`) and the partner
 * routes (`/v1/integrations/events`). One field set, three rule sets: a member submission, a member draft or edit,
 * and a partner event.
 *
 * **A leaf module on purpose.** It imports only `zod` and the leaf `pl-event-details`, so jest specs can import it
 * without pulling `nestjs-zod/z` (ESM) in through the schema barrel.
 */

/** Approval state. `PENDING` is shown to people as "Submitted". Only `APPROVED` events are visible in reads. */
export const PLEventStatusSchema = z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']);
export const PLEventFormatSchema = z.enum(['IN_PERSON', 'VIRTUAL', 'HYBRID']);
export const PLEventAccessSchema = z.enum(['OPEN', 'INVITE', 'PAID']);

export type PLEventStatusValue = z.infer<typeof PLEventStatusSchema>;
export type PLEventFormatValue = z.infer<typeof PLEventFormatSchema>;
export type PLEventAccessValue = z.infer<typeof PLEventAccessSchema>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** `2026-07-24`: a day with no time of day, for an all-day event. */
export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** An instant with an offset (`2026-07-24T09:00:00Z`, `2026-07-24T09:00:00+01:00`). */
export function isDateTime(value: string): boolean {
  return DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
}

export function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const eventDate = z
  .string()
  .trim()
  .refine((value) => isDateOnly(value) || isDateTime(value), 'expected an ISO date-time with an offset, or YYYY-MM-DD');

const httpUrl = z.string().trim().max(2048).refine(isHttpUrl, 'expected an http or https URL');
const email = z.string().trim().max(320).email();
const text = (max: number) => z.string().trim().max(max);

export const PLEventBodyAddressSchema = z.object({
  /** The venue line as the person sees it ("Avenida da Liberdade 10, Lisbon"). */
  address: text(500).nullish(),
  city: text(120).nullish(),
  state: text(120).nullish(),
  country: text(120).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  /** How to find the place ("Ring the bell at door B"). */
  locationInstructions: text(2000).nullish(),
});

export const PLEventBodyCoHostSchema = z.object({
  name: text(200).min(1, 'a co-host needs a name'),
  email: email.nullish(),
});

/** One agenda session, in the shape the submit form and the agenda parser produce. Extra keys are kept. */
export const PLEventBodyAgendaSessionSchema = z
  .object({
    name: text(300).min(1),
    description: text(5000).nullish(),
    start_date: z.string(),
    end_date: z.string(),
    timezone: z.string().nullish(),
  })
  .passthrough();

export const PLEventBodyAgendaSchema = z.object({
  sessions: z.array(PLEventBodyAgendaSessionSchema).max(200).default([]),
  /** The agenda text the person pasted. */
  agendaSummary: text(20000).nullish(),
});

/** Addresses by platform, for example `{ twitter: ['https://x.com/pl'], email: ['events@pl.xyz'] }`. */
export const PLEventBodyContactInfosSchema = z.record(z.array(text(500)).max(10));

export const PLEventBodyAssociationRoleSchema = z.enum(['HOST', 'CO_HOST', 'SPEAKER', 'SPONSOR']);

/** A link from the event to a LabOS member or team. Exactly one of `memberUid` and `teamUid`. */
export const PLEventBodyAssociationSchema = z
  .object({
    role: PLEventBodyAssociationRoleSchema,
    memberUid: z.string().min(1).nullish(),
    teamUid: z.string().min(1).nullish(),
  })
  .refine((value) => !!value.memberUid !== !!value.teamUid, 'expected exactly one of memberUid and teamUid');

/** Every field of an event write. The rule sets below say which are required for which caller. */
export const PLEventBodyFieldsSchema = z.object({
  name: text(200).min(1),
  /** Plain text or HTML. It is sanitized on every write. */
  description: z.string().max(50000).nullish(),
  startDate: eventDate,
  endDate: eventDate.nullish(),
  /** IANA name, for example `Europe/Lisbon`. */
  timezone: z.string().trim().refine(isIanaTimezone, 'expected an IANA time zone name').nullish(),
  /** True when the dates carry no time of day. Date-only values (`YYYY-MM-DD`) need it. */
  allDay: z.boolean().nullish(),
  format: PLEventFormatSchema.nullish(),
  accessOption: PLEventAccessSchema.nullish(),
  tags: z.array(text(80).min(1)).max(30).nullish(),
  hostName: text(200).nullish(),
  hostEmail: email.nullish(),
  coHosts: z.array(PLEventBodyCoHostSchema).max(30).nullish(),
  websiteUrl: httpUrl.nullish(),
  registrationUrl: httpUrl.nullish(),
  meetingUrl: httpUrl.nullish(),
  /** The link that opens the venue on a map. */
  locationUrl: httpUrl.nullish(),
  contactInfos: PLEventBodyContactInfosSchema.nullish(),
  agenda: PLEventBodyAgendaSchema.nullish(),
  address: PLEventBodyAddressSchema.nullish(),
  /** `Image.uid` from an image upload. */
  logoUid: z.string().min(1).nullish(),
  bannerUid: z.string().min(1).nullish(),
  associations: z.array(PLEventBodyAssociationSchema).max(100).nullish(),
});

export type PLEventBodyFields = z.infer<typeof PLEventBodyFieldsSchema>;
export type PLEventBodyAddress = z.infer<typeof PLEventBodyAddressSchema>;
export type PLEventBodyAssociation = z.infer<typeof PLEventBodyAssociationSchema>;

type DateFields = { startDate?: string | null; endDate?: string | null; allDay?: boolean | null };

/**
 * Rules every event write follows, whoever sends it: the end is not before the start, and a date with no time of
 * day needs `allDay: true` (and the other way round).
 */
export function eventDateIssues(value: DateFields): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  const { startDate, endDate } = value;
  for (const [path, date] of [
    ['startDate', startDate],
    ['endDate', endDate],
  ] as const) {
    if (!date) continue;
    if (isDateOnly(date) && value.allDay !== true) {
      issues.push({ path, message: 'a date with no time of day needs allDay: true' });
    }
    if (isDateTime(date) && value.allDay === true) {
      issues.push({ path, message: 'an all-day event takes dates with no time of day (YYYY-MM-DD)' });
    }
  }
  if (startDate && endDate && isDateOnly(startDate) === isDateOnly(endDate)) {
    const start = Date.parse(isDateOnly(startDate) ? `${startDate}T00:00:00Z` : startDate);
    const end = Date.parse(isDateOnly(endDate) ? `${endDate}T00:00:00Z` : endDate);
    if (end < start) issues.push({ path: 'endDate', message: 'endDate is before startDate' });
  } else if (startDate && endDate) {
    issues.push({ path: 'endDate', message: 'startDate and endDate must both have a time of day, or both have none' });
  }
  return issues;
}

type SubmissionFields = {
  endDate?: unknown;
  timezone?: unknown;
  format?: unknown;
  tags?: unknown[] | null;
  hostName?: string | null;
};

/**
 * What a member submission needs on top of a name and a start date, as the old submission form required: an end
 * date, a time zone, a format, at least one tag and a host name. The description and the address are optional.
 * A draft skips the format, the tag and the host.
 */
export function eventSubmissionIssues(
  value: SubmissionFields,
  options: { draft: boolean }
): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  if (!value.endDate) issues.push({ path: 'endDate', message: 'endDate is required' });
  if (!value.timezone) issues.push({ path: 'timezone', message: 'timezone is required' });
  if (options.draft) return issues;
  if (!value.format) issues.push({ path: 'format', message: 'format is required' });
  if (!value.tags?.length) issues.push({ path: 'tags', message: 'at least one tag is required' });
  if (!value.hostName?.trim()) issues.push({ path: 'hostName', message: 'hostName is required' });
  return issues;
}

function addIssues(ctx: z.RefinementCtx, issues: Array<{ path: string; message: string }>) {
  for (const issue of issues) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message });
  }
}

/**
 * `POST /v1/irl/events`, for a signed-in member. `draft: true` stores a draft.
 * A `status` key is not part of the schema, so a submitter cannot choose one.
 */
export const PLEventSubmitBodySchema = PLEventBodyFieldsSchema.extend({
  draft: z.boolean().optional(),
}).superRefine((value, ctx) => {
  addIssues(ctx, eventDateIssues(value));
  addIssues(ctx, eventSubmissionIssues(value, { draft: value.draft === true }));
});

/**
 * `PATCH /v1/irl/events/:uid`. Every field is optional; a missing field keeps its value and `null` clears it.
 * `submit: true` sends a draft for approval. `status` is honoured for a directory admin only.
 * The route checks the date and submission rules on the stored event with the patch applied.
 */
export const PLEventPatchBodySchema = PLEventBodyFieldsSchema.partial().extend({
  submit: z.boolean().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

/**
 * A partner event (`/v1/integrations/events`). It needs only a name, a start date and a format. A missing end
 * date is the start date, and a missing time zone comes from the city's gathering, or is UTC.
 */
export const PLEventPartnerBodySchema = PLEventBodyFieldsSchema.superRefine((value, ctx) => {
  addIssues(ctx, eventDateIssues(value));
  if (!value.format) addIssues(ctx, [{ path: 'format', message: 'format is required' }]);
});

/** `PATCH /v1/integrations/events/:uid`: any subset of the fields. Status and submitter never change here. */
export const PLEventPartnerPatchBodySchema = PLEventBodyFieldsSchema.partial();

export type PLEventSubmitBody = z.infer<typeof PLEventSubmitBodySchema>;
export type PLEventPatchBody = z.infer<typeof PLEventPatchBodySchema>;
export type PLEventPartnerBody = z.infer<typeof PLEventPartnerBodySchema>;
export type PLEventPartnerPatchBody = z.infer<typeof PLEventPartnerPatchBodySchema>;

/** The answer of an event write: the LabOS uid and the status the server decided. */
export const PLEventWriteResultSchema = z.object({
  uid: z.string(),
  status: PLEventStatusSchema,
});

/** `GET /v1/irl/events/mine`: one row per event the member submitted. */
export const ResponseMyPLEventSchema = z.object({
  uid: z.string(),
  name: z.string(),
  slugURL: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  allDay: z.boolean(),
  timezone: z.string().nullable(),
  status: PLEventStatusSchema,
  /** The curator's note of the last decision, for example why the event was rejected. */
  reviewNote: z.string().nullable(),
  logo: z.string().nullable(),
  location: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ResponseMyPLEventsSchema = z.array(ResponseMyPLEventSchema);

/** `POST /v1/irl/events/agenda/parse`: agenda text with the event's start, end and time zone. */
export const PLEventAgendaParseBodySchema = z.object({
  text: z.string().trim().min(1).max(20000),
  startDate: eventDate,
  endDate: eventDate,
  timezone: z.string().trim().refine(isIanaTimezone, 'expected an IANA time zone name'),
});

export type PLEventAgendaParseBody = z.infer<typeof PLEventAgendaParseBodySchema>;

export const ResponsePLEventAgendaParseSchema = z.object({
  sessions: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      /** Instants (ISO, UTC). */
      start_date: z.string(),
      end_date: z.string(),
      timezone: z.string(),
    })
  ),
  /** What is missing when the text gave no sessions; null otherwise. */
  message: z.string().nullable(),
});

export const ResponsePLEventPlaceSuggestionsSchema = z.array(z.object({ text: z.string(), placeId: z.string() }));

export const ResponsePLEventPlaceSchema = z.object({
  placeId: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  locationUrl: z.string(),
  /** IANA name, or null when the time zone lookup failed. */
  timezone: z.string().nullable(),
});

/**
 * One line for a list of problems: `endDate: endDate is before startDate; tags: at least one tag is required`.
 * The API's error filter returns `message` only when it is text, so validation errors are sent as one line.
 */
export function eventIssuesMessage(issues: Array<{ path: Array<string | number> | string; message: string }>): string {
  return issues
    .map((issue) => {
      const path = Array.isArray(issue.path) ? issue.path.join('.') : issue.path;
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

/**
 * Parses a submit body and, when it is refused, names every problem in one answer. Zod stops at the fields that
 * are missing or have a wrong type and does not reach the submission rules, so a body with no name would hide that
 * it also has no tag and no host. The submission rules are run on the raw body too, and the two lists are joined.
 */
export function parseEventSubmitBody(
  raw: unknown
): { success: true; data: PLEventSubmitBody } | { success: false; message: string } {
  const parsed = PLEventSubmitBodySchema.safeParse(raw ?? {});
  if (parsed.success) return { success: true, data: parsed.data };

  // The cast keeps this file compiling in the back-office build, which is not strict and so does not narrow the
  // result of `safeParse` by `success`.
  const zodIssues = (parsed as z.SafeParseError<unknown>).error.issues;
  const issues: Array<{ path: Array<string | number> | string; message: string }> = [...zodIssues];
  const named = new Set(zodIssues.map((issue) => String(issue.path[0] ?? '')));
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const body = raw as Record<string, unknown>;
    const extra = eventSubmissionIssues(
      {
        endDate: body.endDate,
        timezone: body.timezone,
        format: body.format,
        tags: Array.isArray(body.tags) ? body.tags : null,
        hostName: typeof body.hostName === 'string' ? body.hostName : null,
      },
      { draft: body.draft === true }
    );
    for (const issue of extra) {
      if (!named.has(issue.path)) issues.push(issue);
    }
  }
  return { success: false, message: eventIssuesMessage(issues) };
}
