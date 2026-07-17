import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const UpdateAppMetadataSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  prd: z.string().max(100000).nullable().optional(),
});

export class UpdateAppMetadataDto extends createZodDto(UpdateAppMetadataSchema) {}
