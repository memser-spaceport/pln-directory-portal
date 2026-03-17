import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const CommunityAffiliationSchema = z.object({
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

export const ResponseCommunityAffiliationSchema = CommunityAffiliationSchema.extend({
  teams: z.array(SimpleTeamSchema).optional(),
}).omit({
  id: true,
}).strict();

export const CreateCommunityAffiliationSchema = CommunityAffiliationSchema.pick({
  title: true,
});

export const UpdateCommunityAffiliationSchema = CommunityAffiliationSchema.pick({
  title: true,
});

export const CommunityAffiliationRelationalFields = ResponseCommunityAffiliationSchema.pick({
  teams: true,
}).strip();

export const CommunityAffiliationQueryableFields = ResponseCommunityAffiliationSchema.omit({
  teams: true,
}).keyof();

export const CommunityAffiliationQueryParams = QueryParams({
  queryableFields: CommunityAffiliationQueryableFields,
  relationalFields: CommunityAffiliationRelationalFields,
});

export const CommunityAffiliationDetailQueryParams =
  CommunityAffiliationQueryParams.unwrap().pick(RETRIEVAL_QUERY_FILTERS).optional();

export class CreateCommunityAffiliationDto extends createZodDto(
  CreateCommunityAffiliationSchema
) {}

export class UpdateCommunityAffiliationDto extends createZodDto(
  UpdateCommunityAffiliationSchema
) {}
