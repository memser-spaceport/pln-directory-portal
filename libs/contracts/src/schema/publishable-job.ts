import { z } from 'zod';

/**
 * The one shape an integrated system (for example a team's ATS) submits to put a
 * role on the LabOS job board. Integrations vendor this file; keep it free of
 * imports other than zod.
 */

export const PUBLISHABLE_JOB_STATES = ['published', 'paused', 'closed'] as const;
export const PublishableJobStateSchema = z.enum(PUBLISHABLE_JOB_STATES);
export type PublishableJobState = z.infer<typeof PublishableJobStateSchema>;

/** The board's stored work-mode vocabulary; the crawler and alert filters use the same three values. */
export const WORK_MODES = ['remote', 'hybrid', 'in-office'] as const;
export const WorkModeSchema = z.enum(WORK_MODES);

export const PAY_PERIODS = ['year', 'month', 'hour'] as const;
export const PayPeriodSchema = z.enum(PAY_PERIODS);

/** Public pay range in whole currency units. Omit `pay` entirely to publish without compensation. */
export const PaySchema = z
  .object({
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a three-letter ISO 4217 code'),
    period: PayPeriodSchema,
  })
  .refine((pay) => pay.min <= pay.max, { message: 'pay.min must not exceed pay.max', path: ['min'] });
export type Pay = z.infer<typeof PaySchema>;

export const PublishableJobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  descriptionHtml: z.string().trim().min(1),
  state: PublishableJobStateSchema,
  department: z.string().trim().min(1).max(100).optional(),
  roleCategory: z.string().trim().min(1).max(100).optional(),
  seniority: z.string().trim().min(1).max(100).optional(),
  workMode: WorkModeSchema.optional(),
  locations: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  summary: z.string().trim().min(1).max(2000).optional(),
  pay: PaySchema.optional(),
  equityNote: z.string().trim().min(1).max(500).optional(),
  postedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'postedAt must be an ISO 8601 datetime' })
    .optional(),
});
export type PublishableJob = z.infer<typeof PublishableJobSchema>;

/** The caller's own id for a role; carried in the route path. */
export const ExternalIdSchema = z.string().trim().min(1).max(200);

export const JobStatePatchSchema = z.object({ state: PublishableJobStateSchema });
export type JobStatePatch = z.infer<typeof JobStatePatchSchema>;

export const ClaimJobSchema = z.object({
  uid: z.string().trim().min(1),
  externalId: ExternalIdSchema,
});
export type ClaimJob = z.infer<typeof ClaimJobSchema>;

export const IntegrationJobResponseSchema = z.object({
  uid: z.string(),
  externalId: z.string(),
  dedupKey: z.string(),
  status: z.string(),
  publishedAt: z.string().nullable(),
  boardUrl: z.string(),
});
export type IntegrationJobResponse = z.infer<typeof IntegrationJobResponseSchema>;

export const IntegrationJobListItemSchema = z.object({
  uid: z.string(),
  /** Null for rows the calling key does not own. */
  externalId: z.string().nullable(),
  ownedByCaller: z.boolean(),
  managedBy: z.string().nullable(),
  status: z.string(),
  roleTitle: z.string(),
  dedupKey: z.string(),
  publishedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  boardUrl: z.string(),
});
export type IntegrationJobListItem = z.infer<typeof IntegrationJobListItemSchema>;
