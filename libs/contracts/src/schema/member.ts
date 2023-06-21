import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { ResponseImageWithRelationsSchema } from './image';
import { LocationResponseSchema } from './location';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';
import { ResponseSkillSchema } from './skill';
import { ResponseTeamMemberRoleSchema } from './team-member-role';

export const GitHubRepositorySchema = z.object({
  name: z.string(),
  description: z.string(),
  url: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PreferenceSchema = z.object({
  showEmail:z.boolean(),
  showGithubHandle:z.boolean(),
  showTelegram:z.boolean(),
  showLinkedin:z.boolean(),
  showDiscord:z.boolean(),
  showGithubProjects:z.boolean(),
  showTwitter:z.boolean()
});

export const MemberSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
  email: z.string(),
  imageUid: z.string().nullish(),
  githubHandler: z.string().nullish(),
  discordHandler: z.string().nullish(),
  twitterHandler: z.string().nullish(),
  telegramHandler: z.string().nullish(),
  officeHours: z.string().nullish(),
  airtableRecId: z.string().nullish(),
  plnFriend: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  locationUid: z.string(),
  openToWork: z.boolean(),
  linkedinHandler: z.string().nullish(),
  repositories: GitHubRepositorySchema.array().optional(),
  preferences: PreferenceSchema.optional()
});



export const ResponseMemberSchema = MemberSchema.omit({ id: true }).strict();

export const ResponseMemberWithRelationsSchema = ResponseMemberSchema.extend({
  image: ResponseImageWithRelationsSchema.optional(),
  location: LocationResponseSchema.optional(),
  skills: ResponseSkillSchema.array().optional(),
  teamMemberRoles: ResponseTeamMemberRoleSchema.array().optional(),
});


export const CreateMemberSchema = MemberSchema.pick({
  name: true,
  email: true,
  imageUid: true,
  githubHandler: true,
  discordHandler: true,
  twitterHandler: true,
  officeHours: true,
  plnFriend: true,
  locationUid: true,
});

export const MemberRelationalFields = ResponseMemberWithRelationsSchema.pick({
  image: true,
  location: true,
  skills: true,
  teamMemberRoles: true,
}).strip();

export const MemberQueryableFields = ResponseMemberSchema.keyof();

export const MemberQueryParams = QueryParams({
  queryableFields: MemberQueryableFields,
  relationalFields: MemberRelationalFields,
});

export const MemberDetailQueryParams = MemberQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export class MemberDto extends createZodDto(MemberSchema) {}

export class CreateMemberSchemaDto extends createZodDto(CreateMemberSchema) {}

export class ResponseMemberSchemaDto extends createZodDto(
  ResponseMemberSchema
) {}

export type TMemberResponse = z.infer<typeof ResponseMemberWithRelationsSchema>;
