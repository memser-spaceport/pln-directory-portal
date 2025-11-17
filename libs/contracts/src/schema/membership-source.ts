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

const SimpleTeamSchema = z.object({
  uid: z.string(),
  name: z.string(),
  logo: z.object({
    url: z.string(),
  }).optional().nullable(),
});

export const ResponseMembershipSourceSchema = MembershipSourceSchema.extend({
  teams: z.array(SimpleTeamSchema).optional(),
}).omit({
  id: true,
}).strict();

export const CreateMembershipSourceSchema = MembershipSourceSchema.pick({
  title: true,
});

export const UpdateMembershipSourceSchema = MembershipSourceSchema.pick({
  title: true,
});

export const MembershipSourceRelationalFields = ResponseMembershipSourceSchema.pick({
  teams: true,
}).strip();

export const MembershipSourceQueryableFields = ResponseMembershipSourceSchema.omit({
  teams: true,
}).keyof();

export const MembershipSourceQueryParams = QueryParams({
  queryableFields: MembershipSourceQueryableFields,
  relationalFields: MembershipSourceRelationalFields,
});

export const MembershipSourceDetailQueryParams =
  MembershipSourceQueryParams.unwrap().pick(RETRIEVAL_QUERY_FILTERS).optional();

export class CreateMembershipSourceDto extends createZodDto(
  CreateMembershipSourceSchema
) {}

export class UpdateMembershipSourceDto extends createZodDto(
  UpdateMembershipSourceSchema
) {}
