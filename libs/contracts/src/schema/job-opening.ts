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

const ListParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => toStringArray(v));

export const JobsListQueryParams = z.object({
  roleCategory: ListParam,
  seniority: ListParam,
  focus: ListParam,
  location: ListParam,
  q: z.string().optional(),
  sort: z.enum(['newest', 'company_az']).optional().default('newest'),
  page: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1))
    .optional()
    .default(1),
  limit: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(100))
    .optional()
    .default(50),
});

export type JobsListQuery = z.infer<typeof JobsListQueryParams>;

export const JobRoleSchema = z.object({
  uid: z.string(),
  roleTitle: z.string(),
  roleCategory: z.string().nullable(),
  seniority: z.string().nullable(),
  location: z.string().nullable(),
  applyUrl: z.string().nullable(),
  lastUpdated: z.string(),
  postedDate: z.string().nullable(),
});

export const JobTeamSchema = z.object({
  uid: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  focusAreas: z.array(z.string()),
  subFocusAreas: z.array(z.string()),
});

export const JobTeamGroupSchema = z.object({
  team: JobTeamSchema,
  totalRoles: z.number().int(),
  roles: z.array(JobRoleSchema),
});

export const JobsListResponseSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  groups: z.array(JobTeamGroupSchema),
  totalGroups: z.number().int(),
  totalRoles: z.number().int(),
});

export const JobFacetItemSchema = z.object({
  value: z.string(),
  count: z.number().int(),
});

export const JobFacetTreeItemSchema = z.object({
  value: z.string(),
  count: z.number().int(),
  children: z.array(JobFacetItemSchema),
});

export const JobsFiltersResponseSchema = z.object({
  roleCategory: z.array(JobFacetItemSchema),
  seniority: z.array(JobFacetItemSchema),
  focus: z.array(JobFacetTreeItemSchema),
  location: z.array(JobFacetItemSchema),
});
