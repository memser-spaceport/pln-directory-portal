import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/**
 * Body posted to `PATCH /v1/ai-apps/:uid/feedback/:feedbackUid`.
 * Any of the three statuses is always allowed (skips and backwards moves included).
 */
export const UpdateFeedbackStatusSchema = z.object({
  status: z.enum(['NEW', 'VIEWED', 'IMPLEMENTED']),
});

export class UpdateFeedbackStatusDto extends createZodDto(UpdateFeedbackStatusSchema) {}
