import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';

const TypeEnum = z.enum(['MAINTENER', 'COLLABORATOR']);

const ContributorSchema = z.object({
  uid: z.string().optional(), 
  projectUid: z.string().optional(), 
  memberUid: z.string(),
  isDeleted: z.boolean().optional()
});

const ProjectSchema = z.object({
  logoUid: z.string().optional().nullable(),
  name: z.string(),
  tagline: z.string(),
  score: z.number().optional().nullable(),
  description: z.string(),
  contactEmail: z.string().email().nullish().transform((email)=> {
    return email && email.toLowerCase()
  }),
  lookingForFunding: z.boolean().default(false),
  projectLinks: z.object({
    name: z.string(),
    url: z.string()
  }).array().optional(),
  kpis: z.object({ 
    key: z.string(), 
    value: z.string() 
  }).array().optional(),
  maintainingTeamUid: z.string(),
  contributingTeams: z.object({ 
    uid: z.string(), 
    name: z.string() 
  }).array().optional(),
  contributors: ContributorSchema.array().optional(),
  readMe: z.string().optional()
});

export const ResponseProjectWithRelationsSchema = ProjectSchema.extend({});
export const ResponseProjectSuccessSchema = z.object({ success: z.boolean()});
export class UpdateProjectDto extends createZodDto(ProjectSchema.partial().omit({ score: true })) {}
export class CreateProjectDto extends createZodDto(ProjectSchema.omit({ score: true })) {}

