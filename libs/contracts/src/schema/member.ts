import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { LocationResponseSchema } from './location';
import { QueryParams } from './query-params';
import { ResponseSkillSchema } from './skill';
import { ResponseTeamSchema } from './team';
import { ResponseTeamMemberRoleSchema } from './team-member-role';

export const MemberSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullish(),
  githubHandler: z.string().nullish(),
  discordHandler: z.string().nullish(),
  twitterHandler: z.string().nullish(),
  officeHours: z.string().nullish(),
  plnFriend: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  locationUid: z.string(),
});

export const ResponseMemberSchema = MemberSchema.omit({ id: true }).strict();

export const ResponseMemberWithRelationsSchema = ResponseMemberSchema.extend({
  location: LocationResponseSchema.optional(),
  skills: ResponseSkillSchema.array().optional(),
  teams: z.lazy(() => ResponseTeamSchema.array().optional()),
  teamMemberRoles: ResponseTeamMemberRoleSchema.array().optional(),
});

export const CreateMemberSchema = MemberSchema.pick({
  name: true,
  email: true,
  image: true,
  githubHandler: true,
  discordHandler: true,
  twitterHandler: true,
  officeHours: true,
  plnFriend: true,
  locationUid: true,
});

export const MemberRelationalFields = ResponseMemberWithRelationsSchema.pick({
  location: true,
  skills: true,
  teams: true,
  teamMemberRoles: true,
}).strip();

export const MemberQueryableFields = ResponseMemberSchema.keyof();

export const MemberQueryParams = QueryParams({
  queryableFields: MemberQueryableFields,
  relationalFields: MemberRelationalFields,
});

export class MemberDto extends createZodDto(MemberSchema) {}

export class CreateMemberSchemaDto extends createZodDto(CreateMemberSchema) {}

export class ResponseMemberSchemaDto extends createZodDto(
  ResponseMemberSchema
) {}
