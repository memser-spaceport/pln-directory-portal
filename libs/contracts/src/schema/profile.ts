import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';

export const ProfileCompletenessResponseSchema = z.object({
  memberUid: z.string(),
  completeness: z.number(),
  sections: z.object({
    profileDetails: z.number(),
    contactDetails: z.number(),
    teamRole: z.number(),
    experience: z.number(),
    repositories: z.number(),
    projectContributions: z.number(),
  })
});

export class ProfileCompletenessResponse extends createZodDto(ProfileCompletenessResponseSchema) {}
