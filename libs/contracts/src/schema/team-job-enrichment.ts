import { z } from 'zod';

export const DataDiscrepancyFlagSchema = z.enum(['DEAD_URL', 'EMPTY_BOARD', 'MULTI_BOARD']);

export const TeamJobEnrichmentSchema = z.object({
  uid: z.string(),
  teamUid: z.string(),
  careersPageUrl: z.string().nullable(),
  openRolesCount: z.number().int().nullable(),
  lastEnrichmentDate: z.string().nullable(),
  enrichmentSource: z.string().nullable(),
  dataDiscrepancyFlag: DataDiscrepancyFlagSchema.nullable(),
  discrepancyDetails: z.string().nullable(),
  needsReview: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TeamWithEnrichmentSchema = z.object({
  uid: z.string(),
  name: z.string(),
  priority: z.number().nullable(),
  website: z.string().nullable(),
  linkedinHandler: z.string().nullable(),
  focusAreas: z.array(z.string()),
  subFocusAreas: z.array(z.string()),
  enrichment: TeamJobEnrichmentSchema.nullable(),
});

export const TeamsWithEnrichmentResponseSchema = z.object({
  teams: z.array(TeamWithEnrichmentSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});

export const TeamsWithEnrichmentQuerySchema = z.object({
  page: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).optional())
    .default(1),
  limit: z
    .preprocess(
      (v) => (v === undefined || v === '' ? undefined : Number(v)),
      z.number().int().min(1).max(1000).optional()
    )
    .default(100),
});

export const UpdateTeamEnrichmentDtoSchema = z.object({
  teamUid: z.string(),
  careersPageUrl: z.string().optional(),
  openRolesCount: z.number().int().optional(),
  lastEnrichmentDate: z.string().optional(),
  enrichmentSource: z.string().optional(),
  dataDiscrepancyFlag: DataDiscrepancyFlagSchema.optional(),
  discrepancyDetails: z.string().optional(),
  needsReview: z.boolean().optional(),
});

export const BatchUpdateEnrichmentDtoSchema = z.object({
  items: z.array(UpdateTeamEnrichmentDtoSchema),
});

export const BatchUpdateEnrichmentResponseSchema = z.object({
  received: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  failed: z.number().int(),
  errors: z.array(z.string()).optional(),
});

export const JobOpeningsPerTeamResponseSchema = z.object({
  teamUid: z.string(),
  teamName: z.string(),
  jobOpenings: z.array(
    z.object({
      uid: z.string(),
      roleTitle: z.string(),
      roleCategory: z.string().nullable(),
      seniority: z.string().nullable(),
      location: z.string().nullable(),
      workMode: z.string().nullable(),
      sourceLink: z.string().nullable(),
      postedDate: z.string().nullable(),
      status: z.string(),
      detectionDate: z.string(),
      updatedAt: z.string(),
    })
  ),
});

export type DataDiscrepancyFlag = z.infer<typeof DataDiscrepancyFlagSchema>;
export type TeamJobEnrichment = z.infer<typeof TeamJobEnrichmentSchema>;
export type TeamWithEnrichment = z.infer<typeof TeamWithEnrichmentSchema>;
export type TeamsWithEnrichmentResponse = z.infer<typeof TeamsWithEnrichmentResponseSchema>;
export type TeamsWithEnrichmentQuery = z.infer<typeof TeamsWithEnrichmentQuerySchema>;
export type UpdateTeamEnrichmentDto = z.infer<typeof UpdateTeamEnrichmentDtoSchema>;
export type BatchUpdateEnrichmentDto = z.infer<typeof BatchUpdateEnrichmentDtoSchema>;
export type BatchUpdateEnrichmentResponse = z.infer<typeof BatchUpdateEnrichmentResponseSchema>;
export type JobOpeningsPerTeamResponse = z.infer<typeof JobOpeningsPerTeamResponseSchema>;
