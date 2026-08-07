import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const CreateAgentSessionSchema = z.object({
  repository: z.string().min(1).max(100),
  baseBranch: z.string().min(1).max(255).optional(),
  prompt: z.string().min(3).max(20_000),
  createFeatureEnvironment: z.boolean().optional().default(false),
});

export class CreateAgentSessionDto extends createZodDto(CreateAgentSessionSchema) {}
