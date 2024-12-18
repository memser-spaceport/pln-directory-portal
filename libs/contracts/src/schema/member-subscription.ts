import { z } from "zod";
import { createZodDto } from "@abitia/zod-dto";
import { ResponseMemberWithRelationsSchema } from './member';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const MemberSubscriptionSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  memberUid: z.string(),
  entityAction: z.string(),
  entityUid: z.string(),
  entityType: z.enum(["EVENT_LOCATION"]),
  isActive: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CreateMemberSubscriptionSchema = MemberSubscriptionSchema.pick({
  isActive: true,
  memberUid: true,
  entityUid: true,
  entityType: true,
  entityAction: true
});

export const ResponseMemberSubscriptionSchema = MemberSubscriptionSchema.omit({
  id: true,
}).strict();

export const ResponseMemberSubscriptionWithRelationsSchema = ResponseMemberSubscriptionSchema.extend({
  member: ResponseMemberWithRelationsSchema.optional()
});

export const MemberSubscriptionRelationalFields = ResponseMemberSubscriptionWithRelationsSchema.pick({
  member: true
}).strip();

export const MemberSubscriptionQueryableFields = ResponseMemberSubscriptionSchema.keyof();

export const MemberSubscriptionQueryParams = QueryParams({
  relationalFields: MemberSubscriptionRelationalFields,
  queryableFields: MemberSubscriptionQueryableFields,
});

export const MemberSubscriptionDetailQueryParams = MemberSubscriptionQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export class CreateMemberSubscriptionDto extends createZodDto(CreateMemberSubscriptionSchema) {}
export class UpdateMemberSubscriptionDto extends createZodDto(MemberSubscriptionSchema.partial().omit({ id:true, score: true })) {}
