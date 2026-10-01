import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { feedbackCommentText } from './feedback-comment.dto';

/**
 * Body posted to `PATCH /v1/ai-apps/:uid/feedback/:feedbackUid`.
 * Any of the three statuses is always allowed (skips and backwards moves included).
 */
export const UpdateFeedbackStatusSchema = z.object({
  status: z.enum(['NEW', 'VIEWED', 'IMPLEMENTED']),
});

export class UpdateFeedbackStatusDto extends createZodDto(UpdateFeedbackStatusSchema) {}

/**
 * Body posted by an agent to `PATCH /v1/ai-apps/:uid/agent/feedback/:feedbackUid`.
 * Agents may acknowledge or ship feedback; only members can move a row back to NEW.
 *
 * `note` is the agent's closing note — one line on what changed — and is only
 * accepted with IMPLEMENTED (the service rejects it otherwise). It lands in the
 * item's conversation and tells the member who left the feedback. A blank note
 * (which the app-wide empty-string rewrite turns into null) counts as none.
 */
export const AgentUpdateFeedbackStatusSchema = z.object({
  status: z.enum(['VIEWED', 'IMPLEMENTED']),
  note: z.preprocess((value) => (value === null || value === '' ? undefined : value), feedbackCommentText.optional()),
});

export class AgentUpdateFeedbackStatusDto extends createZodDto(AgentUpdateFeedbackStatusSchema) {}
