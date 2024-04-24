import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';

const TypeEnum = z.enum(['MAINTENER', 'COLLABORATOR']);

const ContributionSchema = z.object({
  uid: z.string().optional(), 
  projectUid: z.string().optional(), 
  memberUid: z.string(),
  isDeleted: z.boolean().optional()
});

const ProjectSchema = z.object({
  id: z.number().int(),
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
  readMe: z.string().optional(),
  focusAreas: z.object({
    uid: z.string(), 
    title: z.string() 
  }).array().optional(),
  contributions: ContributionSchema.array().optional()
});

export const ResponseProjectSchema = ProjectSchema.omit({ id: true }).strict();
export const ResponseProjectWithRelationsSchema = ProjectSchema.extend({});
export const ResponseProjectSuccessSchema = z.object({ success: z.boolean()});
// omit score and id to avoid update from request
export class UpdateProjectDto extends createZodDto(ProjectSchema.partial().omit({ id:true, score: true })) {}
export class CreateProjectDto extends createZodDto(ProjectSchema.omit({ id:true, score: true })) {}

