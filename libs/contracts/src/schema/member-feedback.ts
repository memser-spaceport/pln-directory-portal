import { z,  } from "zod";
import { createZodDto } from '@abitia/zod-dto';
import { ResponseMemberSchema } from './member';
import { ResponseMemberFollowUpSchema } from './member-follow-up';

export const MemberFeedbackResponseType = z.enum([
  "POSITIVE",
  "NEGATIVE",
  "NEUTRAL"
]);

const MemberFeedbackSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  type: z.string(),
  data: z.any().optional(),
  rating: z.number().int().optional(),
  comments: z.array(z.string()).optional(),
  response: MemberFeedbackResponseType,
  createdAt: z.string(),
  updatedAt: z.string(),
  followUpUid: z.string(),
  createdBy: z.string()
});

export const CreateMemberFeedbackSchema = MemberFeedbackSchema.pick({
  type: true,
  data: true,
  followUpUid: true,
  rating: true,
  comments: true,
  response: true
});

export const ResponseMemberFeedbackSchema = MemberFeedbackSchema.omit({ id: true }).strict();

export const ResponseMemberFeedbackWithRelationsSchema = ResponseMemberFeedbackSchema.extend({
  creator: ResponseMemberSchema,
  followUp: ResponseMemberFollowUpSchema
});

export const MemberFeedbackRelationalFields = ResponseMemberFeedbackWithRelationsSchema.pick({
  creator: true,
  followUp: true
}).strip();

export class CreateMemberFeedbackSchemaDto extends createZodDto(CreateMemberFeedbackSchema) {}
