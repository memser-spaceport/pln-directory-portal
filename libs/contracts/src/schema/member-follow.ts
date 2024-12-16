import { z } from "zod";
import { createZodDto } from "@abitia/zod-dto";
import { ResponseMemberWithRelationsSchema } from './member';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const MemberFollowSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  memberUid: z.string(),
  followedEntityUid: z.string(),
  followedEntityType: z.enum(["EVENT_LOCATION", "EVENT", "PROJECT"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateMemberFollowSchema = MemberFollowSchema.pick({
  memberUid:true,
  followedEntityUid: true,
  followedEntityType: true,
});

export const ResponseMemberFollowSchema = MemberFollowSchema.omit({
  id: true,
}).strict();

export const ResponseMemberFollowWithRelationsSchema = ResponseMemberFollowSchema.extend({
  member: ResponseMemberWithRelationsSchema.optional()
});

export const MemberFollowRelationalFields = ResponseMemberFollowWithRelationsSchema.pick({
  member: true
}).strip();

export const MemberFollowQueryableFields = ResponseMemberFollowSchema.keyof();

export const MemberFollowQueryParams = QueryParams({
  relationalFields: MemberFollowRelationalFields,
  queryableFields: MemberFollowQueryableFields,
});

export const MemberFollowDetailQueryParams = MemberFollowQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export class CreateMemberFollowDto extends createZodDto(CreateMemberFollowSchema) {}
export class ResponseMemberFollowDto extends createZodDto(ResponseMemberFollowSchema) {}
