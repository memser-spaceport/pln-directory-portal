import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';

export const ProfileCompletenessResponseSchema = z.object({
  memberUid: z.string(),
  completeness: z.number(),
});

export class ProfileCompletenessResponse extends createZodDto(ProfileCompletenessResponseSchema) {}
