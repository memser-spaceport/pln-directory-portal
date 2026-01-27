import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

// ============================================================================
// Query Parameter Schemas
// ============================================================================

export const FounderDashboardQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default('20'),
  demoDayUid: z.string().optional(),
  activity: z.enum(['liked', 'connected', 'invested', 'referral', 'feedback']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['date', 'demoDay']).optional().default('date'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  engagedOnly: z
    .preprocess((val) => val === 'true' || val === true, z.boolean())
    .optional()
    .default(true),
  teamUid: z.string().optional(),
});

export class FounderDashboardQueryDto extends createZodDto(FounderDashboardQuerySchema) {}

export const InvestorDashboardQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default('20'),
  demoDayUid: z.string().optional(),
  activity: z.enum(['liked', 'connected', 'invested', 'referral', 'feedback']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['date', 'demoDay']).optional().default('date'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export class InvestorDashboardQueryDto extends createZodDto(InvestorDashboardQuerySchema) {}

// ============================================================================
// Response Schemas
// ============================================================================

// Common schemas
const ImageSchema = z.object({
  uid: z.string(),
  url: z.string(),
});

const DemoDayRefSchema = z.object({
  uid: z.string(),
  title: z.string(),
  slugURL: z.string(),
});

const ActivitySchema = z.object({
  liked: z.boolean(),
  connected: z.boolean(),
  invested: z.boolean(),
  referral: z.boolean(),
  feedback: z.boolean(),
});

const PaginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

const InvestorItemSchema = z.object({
  uid: z.string(),
  name: z.string(),
  image: ImageSchema.nullable(),
  organization: z
    .object({
      uid: z.string(),
      name: z.string(),
      type: z.enum(['ANGEL', 'FUND', 'ANGEL_AND_FUND']).nullable(),
    })
    .nullable(),
  investmentFocus: z.array(z.string()),
  typicalCheckSize: z.number().nullable(),
  activity: ActivitySchema,
  lastActivityDate: z.string().nullable(),
  demoDay: DemoDayRefSchema,
  hasFeedback: z.boolean(),
});

const TeamRefSchema = z.object({
  uid: z.string(),
  name: z.string(),
});

// Founder Dashboard Response (list only, no stats)
export const FounderDashboardResponseSchema = z.object({
  investors: z.array(InvestorItemSchema),
  teams: z.array(TeamRefSchema),
  pagination: PaginationSchema,
});

export type FounderDashboardResponse = z.infer<typeof FounderDashboardResponseSchema>;

const FundingStageSchema = z.object({
  uid: z.string(),
  title: z.string(),
});

const IndustryTagSchema = z.object({
  uid: z.string(),
  title: z.string(),
});

const TeamItemSchema = z.object({
  uid: z.string(),
  name: z.string(),
  logo: ImageSchema.nullable(),
  fundingStage: FundingStageSchema.nullable(),
  industryTags: z.array(IndustryTagSchema),
  activity: ActivitySchema,
  lastActivityDate: z.string().nullable(),
  demoDay: DemoDayRefSchema,
});

// Investor Dashboard Response (list only, no stats)
export const InvestorDashboardResponseSchema = z.object({
  teams: z.array(TeamItemSchema),
  pagination: PaginationSchema,
});

export type InvestorDashboardResponse = z.infer<typeof InvestorDashboardResponseSchema>;
