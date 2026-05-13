import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';

/**
 * Query parameters for the upload endpoint.
 */
export const UploadTeamTiersQuerySchema = z.object({
  dryRun: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v)),
  /**
   * How to match rows to teams:
   * - 'uid': only by Team.uid (fast path)
   * - 'name': only by Team.name
   * - 'auto': prefer uid if any row has uid; otherwise fall back to name
   */
  matchBy: z.enum(['uid', 'name', 'auto']).optional().default('auto'),
  delimiter: z.string().optional().default(','), // CSV delimiter
  encoding: z.string().optional().default('utf8'), // CSV file encoding
});
export class UploadTeamTiersQueryDto extends createZodDto(UploadTeamTiersQuerySchema) {}

/**
 * Dry run response payload
 */
export const UploadTeamTiersDryRunSchema = z.object({
  dryRun: z.literal(true),
  totalRows: z.number(),
  validRows: z.number(),
  invalidTierRows: z.number(),
  noKeyRows: z.number(),
  duplicatesDropped: z.number(),
  keyType: z.enum(['uid', 'name']),
  sampleValid: z
    .array(
      z.object({
        uid: z.string().optional(),
        name: z.string().optional(),
        tier: z.number().min(1).max(4),
      }),
    )
    .max(5),
  note: z.string(),
});
export class UploadTeamTiersDryRunDto extends createZodDto(UploadTeamTiersDryRunSchema) {}

/**
 * Real update response payload
 */
export const UploadTeamTiersResultSchema = z.object({
  dryRun: z.literal(false),
  updatedCount: z.number(),
  invalidTierRows: z.number(),
  noKeyRows: z.number(),
  duplicatesDropped: z.number(),
  keyType: z.enum(['uid', 'name']),
  // Optional: list of keys that failed to update (not found, etc.)
  failedKeys: z.array(z.string()).optional(),
});
export class UploadTeamTiersResultDto extends createZodDto(UploadTeamTiersResultSchema) {}

/**
 * Query parameters for the force-enrichment endpoints.
 * - `all`: retry every enrichable field except those the user manually edited (overwrites AI-filled values).
 * - `cannotEnrich`: retry only fields whose prior status was CannotEnrich.
 */
export const TriggerForceEnrichmentQuerySchema = z.object({
  mode: z.enum(['all', 'cannotEnrich']).optional().default('all'),
});
export class TriggerForceEnrichmentQueryDto extends createZodDto(TriggerForceEnrichmentQuerySchema) {}

/**
 * Query parameters for GET /v1/admin/teams/enrichment-review (paginated list of teams
 * with at least one low/medium-confidence reviewable field or logo verification).
 *
 * Service-side clamps bounds — the DTO only converts string → number.
 */
const toOptionalInt = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const num = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(num) ? num : undefined;
};

export const EnrichmentReviewQuerySchema = z.object({
  page: z.union([z.string(), z.number()]).optional().transform(toOptionalInt),
  pageSize: z.union([z.string(), z.number()]).optional().transform(toOptionalInt),
});
export class EnrichmentReviewQueryDto extends createZodDto(EnrichmentReviewQuerySchema) {}

/**
 * Reviewable field keys for the field-level approve endpoint. Mirrors FieldMetaKey from
 * team-enrichment.types.ts — duplicated here so the Zod layer can validate without dragging
 * an enum import into the schema module. Keep in sync if FieldMetaKey changes.
 */
export const REVIEWABLE_FIELD_KEYS = [
  'website',
  'blog',
  'contactMethod',
  'twitterHandler',
  'linkedinHandler',
  'telegramHandler',
  'shortDescription',
  'longDescription',
  'moreDetails',
  'industryTags',
  'investmentFocus',
  'logo',
] as const;

/**
 * Body schema for PATCH /v1/admin/teams/:uid/enrichment-review/fields.
 */
export const ApproveEnrichmentFieldsBodySchema = z.object({
  fields: z.array(z.enum(REVIEWABLE_FIELD_KEYS)).min(1),
});
export class ApproveEnrichmentFieldsBodyDto extends createZodDto(ApproveEnrichmentFieldsBodySchema) {}
