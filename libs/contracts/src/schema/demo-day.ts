import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const UpdateFundraisingTeamSchema = z.object({
  name: z.string().optional(),
  shortDescription: z.string().optional(),
  industryTags: z.array(z.string()).optional(),
  fundingStage: z.string().optional(),
  logo: z.string().optional(),
});

export class UpdateFundraisingTeamDto extends createZodDto(UpdateFundraisingTeamSchema) {}
