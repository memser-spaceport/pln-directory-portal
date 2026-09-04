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

/**
 * The only field a member may change on their own subscription. Ownership and
 * the entity being followed are fixed at creation -- a modify that could rewrite
 * `memberUid` is how a subscription gets reassigned to somebody else.
 */
export const ModifyMemberSubscriptionSchema = z.object({
  isActive: z.boolean(),
});

/**
 * Query params for the self read. Deliberately narrow rather than the full
 * `MemberSubscriptionQueryParams`: that read is not approval-filtered, and an
 * unfiltered read should not also be arbitrarily filterable.
 */
export const MySubscriptionsQueryParams = z.object({
  entityUid: z.string().optional(),
  entityType: z.enum(["EVENT_LOCATION"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
});

export const MemberSubscriptionDetailQueryParams = MemberSubscriptionQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export class CreateMemberSubscriptionDto extends createZodDto(CreateMemberSubscriptionSchema) {}
export class UpdateMemberSubscriptionDto extends createZodDto(MemberSubscriptionSchema.partial().omit({ id:true, score: true })) {}
