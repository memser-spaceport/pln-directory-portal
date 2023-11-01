import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';
const ProjectSchema = z.object({
  logoUid: z.string().optional(),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  contactEmail: z.string(),
  lookingForFunding: z.boolean().default(false),
  projectLinks: z.object({
    name: z.string(),
    url: z.string()
  }).array().optional(),
  kpis: z.object({ key: z.string(), value: z.string() }).array().optional(),
  teamUid: z.string(),
  readMe: z.string().optional()
});

export const ResponseProjectWithRelationsSchema = ProjectSchema.extend({});
export const ResponseProjectSuccessSchema = z.object({ success: z.boolean()});
export class CreateProjectDto extends createZodDto(ProjectSchema) {}
export class UpdateProjectDto extends createZodDto(ProjectSchema.partial()) {}
