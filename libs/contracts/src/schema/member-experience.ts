import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';
import { ResponseMemberSchema } from './member';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const MemberExperienceSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  startDate: z.date(),
  endDate: z.date().nullable(),
  isCurrent: z.boolean().default(false),
  experience: z.any().optional(),
  isFlaggedByUser: z.boolean().default(false),
  isModifiedByUser: z.boolean().default(false),
  userUpdatedAt: z.date().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  memberUid: z.string()
});

export const CreateMemberExperienceSchema = MemberExperienceSchema.pick({
  title: true,
  company: true,
  location: true,
  startDate: true,
  endDate: true,
  isCurrent: true,
  isModifiedByUser: true,
  memberUid: true,
});

export const UpdateMemberExperienceSchema = CreateMemberExperienceSchema.partial().extend({
  memberUid: z.string()
});

export const ResponseMemberExperienceSchema = MemberExperienceSchema.omit({ id: true }).strict();

export const ResponseMemberExperienceWithRelationsSchema = ResponseMemberExperienceSchema.extend({
    member: ResponseMemberSchema
  });
  
export const MemberExperienceRelationalFields = ResponseMemberExperienceWithRelationsSchema.pick({
  member: true
}).strip();
  
export const MemberExperienceQueryableFields = ResponseMemberExperienceSchema.keyof();

export const MemberExperienceQueryParams = QueryParams({
  queryableFields: MemberExperienceQueryableFields,
  relationalFields: MemberExperienceRelationalFields
});

export const MemberExperienceDetailQueryParams = MemberExperienceQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export class CreateMemberExperienceDto extends createZodDto(CreateMemberExperienceSchema) {}
export class UpdateMemberExperienceDto extends createZodDto(UpdateMemberExperienceSchema) {}
  