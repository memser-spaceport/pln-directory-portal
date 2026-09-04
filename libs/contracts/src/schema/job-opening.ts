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
  // Scopes the list to a single team. Used by the team profile's "Open roles"
  // section, which needs one team's postings rather than the whole board — and
  // reuses this endpoint so the two surfaces can't disagree about what "open"
  // means. Note `limit` pages TEAMS, not roles, so a scoped query returns all of
  // that team's roles in a single group.
  teamUid: z.string().optional(),
  // One job opening. The board's `?job=` deep link fetches the role even when
  // it is not on the first page of the current filters, so the drawer can open
  // from a shared or emailed link.
  jobUid: z.string().optional(),
  roleCategory: ListParam,
  seniority: ListParam,
  focus: ListParam,
  location: ListParam,
  workMode: ListParam,
  q: z.string().optional(),
  sort: z.enum(['newest', 'company_az', 'company_za']).optional().default('newest'),
  // Optional feed/list date window. Omitted = no date filter (existing jobs page).
  since: z.string().optional(),
  windowDays: z
    .preprocess(
      (v) => (v === undefined || v === '' ? undefined : Number(v)),
      z.number().int().min(1).max(365).optional()
    )
    .optional(),
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
  location: z.array(z.string()),
  workMode: z.string().nullable(),
  applyUrl: z.string().nullable(),
  descriptionHtml: z.string().nullable(),
  lastUpdated: z.string(),
  postedDate: z.string().nullable(),
  detectionDate: z.string(),
  // Aggregate "I'm interested" count. Always present (0 when none).
  interestedCount: z.number().int().min(0),
  // True when the authenticated caller has marked interest. Always false
  // for anonymous requests.
  viewerIsInterested: z.boolean(),
});

export const JobTeamSchema = z.object({
  uid: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  focusAreas: z.array(z.string()),
  subFocusAreas: z.array(z.string()),
  jobReferEmail: z.string().email().nullable(),
  inAppApplyAvailable: z.boolean(),
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
  workMode: z.array(JobFacetItemSchema),
});

export const JobOpeningInterestStatusSchema = z.object({
  jobUid: z.string(),
  interestedCount: z.number().int().min(0),
  viewerIsInterested: z.boolean(),
});

export type JobOpeningInterestStatus = z.infer<typeof JobOpeningInterestStatusSchema>;

export const JobOpeningInterestSchema = z.object({
  uid: z.string(),
  jobUid: z.string(),
  interestedAt: z.string(),
});

export const JobOpeningInterestListResponseSchema = z.object({
  interests: z.array(JobOpeningInterestSchema),
});
