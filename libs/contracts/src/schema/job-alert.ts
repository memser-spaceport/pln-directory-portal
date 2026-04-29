import { z } from 'zod';

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }
  return [value];
};

export const JobAlertFilterStateSchema = z.object({
  q: z.string().optional(),
  roleCategory: z.preprocess(toStringArray, z.array(z.string())).optional().default([]),
  seniority: z.preprocess(toStringArray, z.array(z.string())).optional().default([]),
  focus: z.preprocess(toStringArray, z.array(z.string())).optional().default([]),
  location: z.preprocess(toStringArray, z.array(z.string())).optional().default([]),
  workMode: z.preprocess(toStringArray, z.array(z.string())).optional().default([]),
});

export type JobAlertFilterState = z.infer<typeof JobAlertFilterStateSchema>;

export const JobAlertSchema = z.object({
  uid: z.string(),
  name: z.string(),
  filterState: JobAlertFilterStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type JobAlertResponse = z.infer<typeof JobAlertSchema>;

export const CreateJobAlertSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  filterState: JobAlertFilterStateSchema,
});

export const UpdateJobAlertSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  filterState: JobAlertFilterStateSchema.optional(),
});

export const ListJobAlertsResponseSchema = z.object({
  items: z.array(JobAlertSchema),
  total: z.number().int(),
});

export const CreateJobAlertConflictSchema = z.object({
  existingAlertUid: z.string(),
  message: z.string(),
});

export const VerifyRedirectRequestSchema = z.object({
  token: z.string(),
});

export const VerifyRedirectResponseSchema = z.object({
  applyUrl: z.string().url(),
  alertUid: z.string(),
  jobUid: z.string(),
});

export const UnsubscribeRequestSchema = z.object({
  token: z.string(),
});

export const UnsubscribeResponseSchema = z.object({
  alertUid: z.string(),
  alertName: z.string(),
});
