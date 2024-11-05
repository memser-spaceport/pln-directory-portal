import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { ResponseFundingStageSchema } from './funding-stage';
import { ResponseImageWithRelationsSchema } from './image';
import { ResponseIndustryTagSchema } from './industry-tag';
import { ResponseMembershipSourceSchema } from './membership-source';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';
import { ResponseTeamMemberRoleSchema } from './team-member-role';
import { ResponseTechnologySchema } from './technology';

export const TeamSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
  logoUid: z.string().nullish(),
  blog: z.string().nullish(),
  website: z.string().nullish(),
  contactMethod: z.string().nullish(),
  twitterHandler: z.string().nullish(),
  shortDescription: z.string().nullish(),
  longDescription: z.string().nullish(),
  isFeatured: z.boolean().nullish(),
  plnFriend: z.boolean(),
  startDate: z.date().or(z.string()).nullish(),
  endDate: z.date().or(z.string()).nullish(),
  airtableRecId: z.string().nullish(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
  fundingStageUid: z.string().nullish(),
  linkedinHandler: z.string().nullish(),
  officeHours: z.string().nullish(),
});

export const CreateTeamSchema = TeamSchema.pick({
  name: true,
  logoUid: true,
  blog: true,
  website: true,
  contactMethod: true,
  twitterHandler: true,
  shortDescription: true,
  longDescription: true,
  plnFriend: true,
  fundingStageUid: true,
});

export const ResponseTeamSchema = TeamSchema.omit({ id: true }).strict();

export const ResponseTeamWithRelationsSchema = ResponseTeamSchema.extend({
  logo: ResponseImageWithRelationsSchema.optional(),
  membershipSources: ResponseMembershipSourceSchema.array().optional(),
  industryTags: ResponseIndustryTagSchema.array().optional(),
  fundingStage: ResponseFundingStageSchema.optional(),
  teamMemberRoles: ResponseTeamMemberRoleSchema.array().optional(),
  technologies: ResponseTechnologySchema.array().optional(),
  isHost: z.string()
});

export const TeamQueryableFields = ResponseTeamSchema.keyof();

export const TeamRelationalFields = ResponseTeamWithRelationsSchema.pick({
  logo: true,
  membershipSources: true,
  industryTags: true,
  fundingStage: true,
  teamMemberRoles: true,
  technologies: true,
}).strip();

export const TeamQueryParams = QueryParams({
  queryableFields: TeamQueryableFields,
  relationalFields: TeamRelationalFields,
});

export const TeamDetailQueryParams = TeamQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export class TeamDto extends createZodDto(TeamSchema) {}

export class CreateTeamSchemaDto extends createZodDto(CreateTeamSchema) {}

export type TTeamResponse = z.infer<typeof ResponseTeamWithRelationsSchema>;
