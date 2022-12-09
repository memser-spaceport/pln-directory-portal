import { z } from 'zod';
import { QueryParams } from './query-params';

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
