import { z } from 'zod';

/**
 * What a team lead sends when acting on a role's suggested candidates (LAB-2846).
 *
 * The routes are plain Nest controller methods that `safeParse` these and answer
 * 400 themselves; there is no ts-rest router for them.
 */

export const CONTACT_MESSAGE_MAX_LENGTH = 2000;

/** One extracted match criterion of a role's current posting, as the GET and the PUT return it. */
export const MatchCriterionSchema = z.object({
  text: z.string(),
  enabled: z.boolean(),
});
export type MatchCriterion = z.infer<typeof MatchCriterionSchema>;

/** `PUT /v1/job-openings/:roleUid/match-criteria`: the full set of disabled criteria texts. */
export const MatchCriteriaUpdateBodySchema = z.object({
  disabled: z.array(z.string().max(500)).max(20),
});
export type MatchCriteriaUpdateBody = z.infer<typeof MatchCriteriaUpdateBodySchema>;

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
