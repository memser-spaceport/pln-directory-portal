import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/**
 * Body posted from the app detail page to `POST /v1/ai-apps/:uid/feedback`.
 * Quill HTML (headings, links, images) or legacy plain text. A member may
 * submit multiple entries per app. The 50000 cap is on the serialized string
 * so image URLs fit; the visible-character cap lives on the frontend.
 */
export const SubmitFeedbackSchema = z.object({
  text: z.string().trim().min(1).max(50000),
});

export class SubmitFeedbackDto extends createZodDto(SubmitFeedbackSchema) {}
