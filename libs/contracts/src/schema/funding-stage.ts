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

export const ResponseFundingStageSchema = FundingStageSchema.omit({
  id: true,
}).strict();

export const CreateFundingStageSchema = FundingStageSchema.pick({
  uid: true,
  title: true,
});

export const FundingStageQueryableFields = ResponseFundingStageSchema.keyof();

export const FundingStageQueryParams = QueryParams({
  queryableFields: FundingStageQueryableFields,
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
