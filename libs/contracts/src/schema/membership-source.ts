import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const MembershipSourceSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ResponseMembershipSourceSchema = MembershipSourceSchema.omit({
  id: true,
}).strict();

export const CreateMembershipSourceSchema = MembershipSourceSchema.pick({
  title: true,
});

export const UpdateMembershipSourceSchema = MembershipSourceSchema.pick({
  title: true,
});

export const MembershipSourceQueryableFields =
  ResponseMembershipSourceSchema.keyof();

export const MembershipSourceQueryParams = QueryParams({
  queryableFields: MembershipSourceQueryableFields,
});

export const MembershipSourceDetailQueryParams =
  MembershipSourceQueryParams.unwrap().pick(RETRIEVAL_QUERY_FILTERS).optional();

export class CreateMembershipSourceDto extends createZodDto(
  CreateMembershipSourceSchema
) {}

export class UpdateMembershipSourceDto extends createZodDto(
  UpdateMembershipSourceSchema
) {}
