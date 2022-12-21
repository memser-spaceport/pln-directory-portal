import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { ResponseAcceleratorProgramSchema } from './accelerator-program';
import { ResponseFundingStageSchema } from './funding-stage';
import { ResponseImageWithRelationsSchema } from './image';
import { ResponseIndustryTagSchema } from './industry-tag';
import { ResponseMemberSchema } from './member';
import { QueryParams } from './query-params';
import { ResponseTeamMemberRoleSchema } from './team-member-role';
import { ResponseTechnologySchema } from './technology';

export const TeamSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
  logoUid: z.string().nullish(),
  blog: z.string().nullish(),
  website: z.string().nullish(),
  twitterHandler: z.string().nullish(),
  shortDescription: z.string().nullish(),
  longDescription: z.string().nullish(),
  filecoinUser: z.boolean(),
  ipfsUser: z.boolean(),
  plnFriend: z.boolean(),
  startDate: z.date().or(z.string()).nullish(),
  endDate: z.date().or(z.string()).nullish(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
  fundingStageUid: z.string().nullish(),
});

export const CreateTeamSchema = TeamSchema.pick({
  name: true,
  logoUid: true,
  blog: true,
  website: true,
  twitterHandler: true,
  shortDescription: true,
  longDescription: true,
  filecoinUser: true,
  ipfsUser: true,
  plnFriend: true,
  fundingStageUid: true,
});

export const ResponseTeamSchema = TeamSchema.omit({ id: true }).strict();

export const ResponseTeamWithRelationsSchema = ResponseTeamSchema.extend({
  logo: ResponseImageWithRelationsSchema.optional(),
  acceleratorPrograms: ResponseAcceleratorProgramSchema.array().optional(),
  industryTags: ResponseIndustryTagSchema.array().optional(),
  fundingStage: ResponseFundingStageSchema.optional(),
  members: z.lazy(() => ResponseMemberSchema.array().optional()),
  teamMemberRoles: ResponseTeamMemberRoleSchema.array().optional(),
  technologies: ResponseTechnologySchema.array().optional(),
});

export const TeamQueryableFields = ResponseTeamSchema.keyof();

export const TeamRelationalFields = ResponseTeamWithRelationsSchema.pick({
  logo: true,
  acceleratorPrograms: true,
  industryTags: true,
  fundingStage: true,
  members: true,
  teamMemberRoles: true,
  technologies: true,
}).strip();

export const TeamQueryParams = QueryParams({
  queryableFields: TeamQueryableFields,
  relationalFields: TeamRelationalFields,
});

export class TeamDto extends createZodDto(TeamSchema) {}

export class CreateTeamSchemaDto extends createZodDto(CreateTeamSchema) {}

export type TTeamResponse = z.infer<typeof ResponseTeamWithRelationsSchema>;
