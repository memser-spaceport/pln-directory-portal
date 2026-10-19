import { z } from 'zod';

/**
 * What a team lead sends when acting on a role's suggested candidates (LAB-2846).
 *
 * The routes are plain Nest controller methods that `safeParse` these and answer
 * 400 themselves; there is no ts-rest router for them.
 */

export const CONTACT_MESSAGE_MAX_LENGTH = 2000;

/** The groups a match criterion is filed under (LAB-2854), in the order the Edit criteria modal lists them. */
export const MATCH_CRITERION_GROUPS = ['Skills', 'Experience', 'Seniority', 'Location', 'Other'] as const;
export type MatchCriterionGroup = typeof MATCH_CRITERION_GROUPS[number];
export const MatchCriterionGroupSchema = z.enum(MATCH_CRITERION_GROUPS);

/** Longest short label of a match criterion (LAB-2854). */
export const MATCH_CRITERION_LABEL_MAX_LENGTH = 40;

/**
 * A criterion's short label and group (LAB-2854). Both keys are absent, never `null`, when unknown: criteria
 * extracted before LAB-2854 that the runner has not labelled yet, and suggestions whose criterion is no longer
 * among the role's current criteria. `text` (the full statement) stays the criterion's identity everywhere.
 */
const criterionMetaShape = {
  label: z.string().max(MATCH_CRITERION_LABEL_MAX_LENGTH).optional(),
  group: MatchCriterionGroupSchema.optional(),
};

/** One extracted match criterion of a role's current posting, as the GET and the PUT return it. */
export const MatchCriterionSchema = z.object({
  text: z.string(),
  enabled: z.boolean(),
  ...criterionMetaShape,
});
export type MatchCriterion = z.infer<typeof MatchCriterionSchema>;

/** One criterion of a suggested candidate in the GET: whether the candidate's profile supports it. */
export const SuggestedCandidateCriterionSchema = z.object({
  text: z.string(),
  matched: z.boolean(),
  ...criterionMetaShape,
});
export type SuggestedCandidateCriterion = z.infer<typeof SuggestedCandidateCriterionSchema>;

/** Longest criteria prompt a lead may save, counted after trimming (LAB-2853). */
export const CRITERIA_PROMPT_MAX_LENGTH = 500;

/**
 * `PUT /v1/job-openings/:roleUid/match-criteria`: the full set of disabled criteria texts, and optionally the
 * lead's free-text criteria prompt (LAB-2853).
 *
 * `prompt` semantics:
 * - absent (`undefined`): keep the stored prompt unchanged, so a body from before prompts existed still works;
 * - `null`, `""` or whitespace only: clear the stored prompt (parsed to `null`);
 * - any other string: trimmed, at most `CRITERIA_PROMPT_MAX_LENGTH` characters after trimming.
 *
 * Zod 3.19 has no `.trim()`, so the prompt is trimmed in a transform and its length checked on the trimmed text.
 * The parsed output has no `prompt` key at all when the body had none.
 */
export const MatchCriteriaUpdateBodySchema = z
  .object({
    disabled: z.array(z.string().max(500)).max(20),
    prompt: z.string().nullable().optional(),
  })
  .transform(({ disabled, prompt }): { disabled: string[]; prompt?: string | null } =>
    prompt === undefined ? { disabled } : { disabled, prompt: prompt?.trim() || null }
  )
  .refine((body) => !body.prompt || body.prompt.length <= CRITERIA_PROMPT_MAX_LENGTH, {
    message: `prompt must be at most ${CRITERIA_PROMPT_MAX_LENGTH} characters after trimming`,
    path: ['prompt'],
  });
export type MatchCriteriaUpdateBody = z.infer<typeof MatchCriteriaUpdateBodySchema>;

/** What the PUT returns: every criterion with its flag, and the stored prompt (`null` when none). */
export const MatchCriteriaUpdateResponseSchema = z.object({
  criteria: z.array(MatchCriterionSchema),
  prompt: z.string().nullable(),
});
export type MatchCriteriaUpdateResponse = z.infer<typeof MatchCriteriaUpdateResponseSchema>;

/**
 * `POST /v1/job-openings/:roleUid/suggested-candidates/:memberUid/contact`.
 * Zod 3.19 has no `.trim()`, so the message is trimmed in a transform and its
 * length checked on the trimmed text.
 */
export const SuggestedCandidateContactBodySchema = z
  .object({ message: z.string() })
  .transform((body) => ({ message: body.message.trim() }))
  .refine((body) => body.message.length >= 1 && body.message.length <= CONTACT_MESSAGE_MAX_LENGTH, {
    message: `message must be 1 to ${CONTACT_MESSAGE_MAX_LENGTH} characters after trimming`,
    path: ['message'],
  });
export type SuggestedCandidateContactBody = z.infer<typeof SuggestedCandidateContactBodySchema>;

/**
 * `POST /v1/job-match/unsubscribe` (LAB-2850): the signed token from the suggested-candidates email's
 * unsubscribe link. Public route; the token is the only credential.
 */
export const SuggestedCandidatesUnsubscribeRequestSchema = z.object({
  token: z.string().min(1).max(2048),
});
export type SuggestedCandidatesUnsubscribeRequest = z.infer<typeof SuggestedCandidatesUnsubscribeRequestSchema>;

export const SuggestedCandidatesUnsubscribeResponseSchema = z.object({
  memberUid: z.string(),
  suggestedCandidatesEmailEnabled: z.literal(false),
});
export type SuggestedCandidatesUnsubscribeResponse = z.infer<typeof SuggestedCandidatesUnsubscribeResponseSchema>;

/**
 * `POST /v1/service/job-match/suggested-candidates-email` (LAB-2850): send for this run, or for the latest
 * completed run when `runUid` is absent. A missing body is treated as `{}`.
 */
export const SuggestedCandidatesEmailSendRequestSchema = z.object({
  runUid: z.string().min(1).optional(),
});
export type SuggestedCandidatesEmailSendRequest = z.infer<typeof SuggestedCandidatesEmailSendRequestSchema>;

export const SuggestedCandidatesEmailSendResponseSchema = z.object({
  runUid: z.string(),
  dryRun: z.boolean(),
  sent: z.number(),
  skipped: z.number(),
});
export type SuggestedCandidatesEmailSendResponse = z.infer<typeof SuggestedCandidatesEmailSendResponseSchema>;
