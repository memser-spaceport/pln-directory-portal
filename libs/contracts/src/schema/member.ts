import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { ResponseImageWithRelationsSchema } from './image';
import { LocationResponseSchema } from './location';
import { QueryParams } from './query-params';
import { ResponseSkillSchema } from './skill';
import { ResponseTeamMemberRoleSchema } from './team-member-role';

export const MemberSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
  email: z.string(),
  imageUid: z.string().nullish(),
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
  image: ResponseImageWithRelationsSchema.optional(),
  location: LocationResponseSchema.optional(),
  skills: ResponseSkillSchema.array().optional(),
  teamMemberRoles: z.lazy(() =>
    ResponseTeamMemberRoleSchema.array().optional()
  ),
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

export class MemberDto extends createZodDto(MemberSchema) {}

export class CreateMemberSchemaDto extends createZodDto(CreateMemberSchema) {}

export class ResponseMemberSchemaDto extends createZodDto(
  ResponseMemberSchema
) {}

export type TMemberResponse = z.infer<typeof ResponseMemberWithRelationsSchema>;
