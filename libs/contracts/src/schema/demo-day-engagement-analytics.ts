import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

// Base schema with optional teamFundraisingProfileUid for admin users and date filtering
export const DashboardBaseQuerySchema = z.object({
  teamFundraisingProfileUid: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export class DashboardBaseQueryDto extends createZodDto(DashboardBaseQuerySchema) {}

// Timeline extends base with aggregation parameter
export const EngagementTimelineQuerySchema = DashboardBaseQuerySchema.extend({
  aggregation: z.enum(['hour', 'day']).optional().default('day'),
});

export class EngagementTimelineQueryDto extends createZodDto(EngagementTimelineQuerySchema) {}

// Investor activity extends base
export const InvestorActivityQuerySchema = DashboardBaseQuerySchema.extend({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => (val ? Number(val) : 20), z.number().int().min(1).max(100).default(20)),
  sortBy: z.enum(['lastActivity', 'totalInteractions', 'name']).optional().default('lastActivity'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export class InvestorActivityQueryDto extends createZodDto(InvestorActivityQuerySchema) {}
