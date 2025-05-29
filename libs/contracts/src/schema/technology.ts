import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const TechnologySchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ResponseTechnologySchema = TechnologySchema.omit({
  id: true,
}).strict();

export const TechnologyQueryableFields = ResponseTechnologySchema.keyof();

export const TechnologyQueryParams = QueryParams({
  queryableFields: TechnologyQueryableFields,
});

export const TechnologyDetailQueryParams = TechnologyQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export const CreateTechnologySchema = TechnologySchema.pick({
  title: true,
});

export const UpdateTechnologySchema = TechnologySchema.pick({
  title: true,
}).partial();

export class TechnologyDto extends createZodDto(TechnologySchema) {}

export class CreateTechnologyDto extends createZodDto(CreateTechnologySchema) {}

export class UpdateTechnologyDto extends createZodDto(UpdateTechnologySchema) {}

export class ResponseTechnologyDto extends createZodDto(ResponseTechnologySchema) {}
