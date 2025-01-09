import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { ResponseTeamWithRelationsSchema } from './team';
import { ResponseMemberWithRelationsSchema } from './member';
import { ResponseImageWithRelationsSchema } from './image';

const TypeEnum = z.enum(['MAINTENER', 'COLLABORATOR']);

const ContributionSchema = z.object({
  uid: z.string().optional(), 
  projectUid: z.string().optional(), 
  memberUid: z.string(),
  isDeleted: z.boolean().optional()
});

const ProjectSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  logoUid: z.string().optional().nullable(),
  name: z.string(),
  tagline: z.string(),
  score: z.number().optional().nullable(),
  description: z.string(),
  isFeatured: z.boolean().nullish(),
  contactEmail: z.string().email().nullish().transform((email)=> {
    return email && email.toLowerCase()
  }),
  lookingForFunding: z.boolean().default(false),
  projectLinks: z.object({
    name: z.string(),
    url: z.string()
  }).array().optional(),
  highlightContent: z.object({title: z.string(),description: z.string(),link:z.string()}).array().optional(),
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
  contributions: ContributionSchema.array().optional(),
  isDeleted: z.boolean().default(false),
  osoProjectName: z.string().optional(),
});

export const ResponseProjectSchema = ProjectSchema.omit({ id: true }).strict();
export const ResponseProjectWithRelationsSchema = ResponseProjectSchema.extend({
  logo: ResponseImageWithRelationsSchema.optional(),
  maintainingTeam: ResponseTeamWithRelationsSchema.optional(),
  contributingTeams: ResponseTeamWithRelationsSchema.array().optional(),
  creator: ResponseMemberWithRelationsSchema.optional()
});
export const ResponseProjectSuccessSchema = z.object({ success: z.boolean()});
// omit score and id to avoid update from request
export class UpdateProjectDto extends createZodDto(ProjectSchema.partial().omit({ id:true, score: true })) {}
export class CreateProjectDto extends createZodDto(ProjectSchema.omit({ id:true, score: true })) {}

