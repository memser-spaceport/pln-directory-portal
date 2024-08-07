import { z,  } from "zod";
import { ResponseMemberSchema } from './member';
import { ResponseMemberInteractionSchema } from './member-interaction';
import { QueryParams } from './query-params';

export const MemberFollowUpType = z.enum([
  "MEETING_INITIATED", 
  "MEETING_SCHEDULED",
  "MEETING_YET_TO_HAPPEN",
  "MEETING_RESCHEDULED"
]);

export const MemberFollowUpStatus = z.enum(["PENDING", "COMPLETED", "CLOSED"]);

const MemberFollowUpSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  type: MemberFollowUpType,
  status: MemberFollowUpStatus,
  data: z.any().optional(),
  isDelayed: z.boolean(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  interactionUid: z.string()
});

export const ResponseMemberFollowUpSchema = MemberFollowUpSchema.omit({ id: true }).strict();

export const ResponseMemberFollowUpWithRelationsSchema = ResponseMemberFollowUpSchema.extend({
  creator: ResponseMemberSchema,
  interaction: ResponseMemberInteractionSchema
});

export const MemberFollowUpRelationalFields = ResponseMemberFollowUpWithRelationsSchema.pick({
  creator: true,
  interaction: true
}).strip();

export const MemberFollowUpQueryableFields = ResponseMemberFollowUpSchema.keyof();

export const MemberFollowUpQueryParams = QueryParams({
  queryableFields: MemberFollowUpQueryableFields,
  relationalFields: MemberFollowUpRelationalFields
});


