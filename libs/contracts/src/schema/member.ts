import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

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

export const ResponseMemberSchema = MemberSchema.omit({
  id: true,
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

export class MemberDto extends createZodDto(MemberSchema) {}

export class CreateMemberSchemaDto extends createZodDto(CreateMemberSchema) {}

export class ResponseMemberSchemaDto extends createZodDto(
  ResponseMemberSchema
) {}
