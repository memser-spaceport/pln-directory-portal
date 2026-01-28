import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const EngagementTimelineQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export class EngagementTimelineQueryDto extends createZodDto(EngagementTimelineQuerySchema) {}

export const InvestorActivityQuerySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => (val ? Number(val) : 20), z.number().int().min(1).max(100).default(20)),
  sortBy: z.enum(['lastActivity', 'totalInteractions', 'name']).optional().default('lastActivity'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export class InvestorActivityQueryDto extends createZodDto(InvestorActivityQuerySchema) {}
