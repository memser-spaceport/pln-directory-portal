import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const EngagementTimelineQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export class EngagementTimelineQueryDto extends createZodDto(EngagementTimelineQuerySchema) {}
