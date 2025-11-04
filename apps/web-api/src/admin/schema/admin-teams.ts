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
