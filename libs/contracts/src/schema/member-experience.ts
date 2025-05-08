import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';
import { ResponseMemberSchema } from './member';

export const MemberExperienceSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  startDate: z.object({
    day: z.number().optional(),
    month: z.number(),
    year: z.number()
  }),
  endDate: z.object({
    day: z.number().optional(),
    month: z.number(),
    year: z.number()
  }),
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
  
export class CreateMemberExperienceDto extends createZodDto(CreateMemberExperienceSchema) {}
export class UpdateMemberExperienceDto extends createZodDto(UpdateMemberExperienceSchema) {}
