import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { AiAppTagsSchema, parseMultipartStringList } from './deploy-app.dto';

export const UpdateAppMetadataSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  prd: z.string().max(100000).nullable().optional(),
  /** Replaces the whole tag list. Also accepted as a string on the multipart (PRD file) path. */
  tags: z.preprocess(parseMultipartStringList, AiAppTagsSchema.optional()),
});

export class UpdateAppMetadataDto extends createZodDto(UpdateAppMetadataSchema) {}
