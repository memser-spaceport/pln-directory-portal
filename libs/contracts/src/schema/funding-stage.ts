import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { QueryParams } from './query-params';

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

export class CreateFundingStageDto extends createZodDto(
  CreateFundingStageSchema
) {}

export class ResponseFundingStageDto extends createZodDto(
  ResponseFundingStageSchema
) {}
