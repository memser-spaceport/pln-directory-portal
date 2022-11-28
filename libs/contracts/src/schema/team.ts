import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { ResponseAcceleratorProgramSchema } from './accelerator-program';
import { ResponseFundingStageSchema } from './funding-stage';
import { ResponseIndustryTagSchema } from './industry-tag';
import { ResponseMemberSchema } from './member';
import { QueryParams } from './query-params';
import { ResponseTeamMemberRoleSchema } from './team-member-role';

export const TeamSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
  logo: z.string().nullish(),
  blog: z.string().nullish(),
  website: z.string().nullish(),
  twitterHandler: z.string().nullish(),
  shortDescripton: z.string().nullish(),
  longDescripton: z.string().nullish(),
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
  logo: true,
  blog: true,
  website: true,
  twitterHandler: true,
  shortDescripton: true,
  longDescripton: true,
  filecoinUser: true,
  ipfsUser: true,
  plnFriend: true,
  fundingStageUid: true,
});

export const ResponseTeamSchema = TeamSchema.omit({ id: true }).strict();

export const ResponseTeamWithRelationsSchema = ResponseTeamSchema.extend({
  acceleratorPrograms: ResponseAcceleratorProgramSchema.array().optional(),
  industryTags: ResponseIndustryTagSchema.array().optional(),
  fundingStage: ResponseFundingStageSchema.optional(),
  members: z.lazy(() => ResponseMemberSchema.array().optional()),
  teamMemberRoles: ResponseTeamMemberRoleSchema.array().optional(),
});

export const TeamQueryableFields = ResponseTeamSchema.keyof();

export const TeamRelationalFields = ResponseTeamWithRelationsSchema.pick({
  acceleratorPrograms: true,
  industryTags: true,
  fundingStage: true,
  members: true,
  teamMemberRoles: true,
}).strip();

export const TeamQueryParams = QueryParams({
  queryableFields: TeamQueryableFields,
  relationalFields: TeamRelationalFields,
});

export class TeamDto extends createZodDto(TeamSchema) {}

export class CreateTeamSchemaDto extends createZodDto(CreateTeamSchema) {}
