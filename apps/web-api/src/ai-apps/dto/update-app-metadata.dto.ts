import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { AiAppTagsSchema, parseMultipartStringList } from './deploy-app.dto';

/** Multipart sends booleans as strings. `z.coerce.boolean()` treats `"false"` as true. */
function parseMultipartBoolean(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return value;
}

export const UpdateAppMetadataSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  prd: z.string().max(100000).nullable().optional(),
  /** Replaces the whole tag list. Also accepted as a string on the multipart (PRD file) path. */
  tags: z.preprocess(parseMultipartStringList, AiAppTagsSchema.optional()),
  /** LabOS Give feedback on the open app. Also accepted as `"true"` / `"false"` on the multipart path. */
  feedbackEnabled: z.preprocess(parseMultipartBoolean, z.boolean().optional()),
});

export class UpdateAppMetadataDto extends createZodDto(UpdateAppMetadataSchema) {}
