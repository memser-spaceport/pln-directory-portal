import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';

const ProjectSchema = z.object({
  logoUid: z.string().optional().nullable(),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  contactEmail: z.string().email().nullish().transform((email)=> {
    return email && email.toLowerCase()
  }),
  lookingForFunding: z.boolean().default(false),
  projectLinks: z.object({
    name: z.string(),
    url: z.string()
  }).array().optional(),
  kpis: z.object({ key: z.string(), value: z.string() }).array().optional(),
  maintainingTeamUid: z.string(),
  contributingTeams: z.object({ uid: z.string(), name: z.string() }).array().optional(),
  readMe: z.string().optional()
});

export const ResponseProjectWithRelationsSchema = ProjectSchema.extend({});
export const ResponseProjectSuccessSchema = z.object({ success: z.boolean()});
export class UpdateProjectDto extends createZodDto(ProjectSchema.partial()) {}
export class CreateProjectDto extends createZodDto(ProjectSchema) {}

