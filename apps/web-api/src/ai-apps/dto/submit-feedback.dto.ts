import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/**
 * Body posted from the app detail page to `POST /v1/ai-apps/:uid/feedback`.
 * Free-text only; a member may submit multiple entries per app.
 */
export const SubmitFeedbackSchema = z.object({
  text: z.string().trim().min(1).max(5000),
});

export class SubmitFeedbackDto extends createZodDto(SubmitFeedbackSchema) {}
