import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const FundingStageSchema = z.object({
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

export const ResponseFundingStageSchema = FundingStageSchema.extend({
  teams: z.array(SimpleTeamSchema).optional(),
}).omit({
  id: true,
}).strict();

export const CreateFundingStageSchema = FundingStageSchema.pick({
  uid: true,
  title: true,
});

export const FundingStageRelationalFields = ResponseFundingStageSchema.pick({
  teams: true,
}).strip();

export const FundingStageQueryableFields = ResponseFundingStageSchema.omit({
  teams: true,
}).keyof();

export const FundingStageQueryParams = QueryParams({
  queryableFields: FundingStageQueryableFields,
  relationalFields: FundingStageRelationalFields,
});

export const FundingStageDetailQueryParams = FundingStageQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export class CreateFundingStageDto extends createZodDto(
  CreateFundingStageSchema
) {}

export class ResponseFundingStageDto extends createZodDto(
  ResponseFundingStageSchema
) {}
