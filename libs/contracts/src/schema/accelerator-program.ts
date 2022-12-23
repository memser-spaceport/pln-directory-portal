import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const AcceleratorProgramSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ResponseAcceleratorProgramSchema = AcceleratorProgramSchema.omit({
  id: true,
}).strict();

export const CreateAcceleratorProgramSchema = AcceleratorProgramSchema.pick({
  title: true,
});

export const UpdateAcceleratorProgramSchema = AcceleratorProgramSchema.pick({
  title: true,
});

export const AcceleratorProgramQueryableFields =
  ResponseAcceleratorProgramSchema.keyof();

export const AcceleratorProgramQueryParams = QueryParams({
  queryableFields: AcceleratorProgramQueryableFields,
});

export const AcceleratorProgramDetailQueryParams =
  AcceleratorProgramQueryParams.unwrap()
    .pick(RETRIEVAL_QUERY_FILTERS)
    .optional();

export class CreateAcceleratorProgramDto extends createZodDto(
  CreateAcceleratorProgramSchema
) {}

export class UpdateAcceleratorProgramDto extends createZodDto(
  UpdateAcceleratorProgramSchema
) {}
