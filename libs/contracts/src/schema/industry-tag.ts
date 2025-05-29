import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { ResponseIndustryCategorySchema } from './industry-category';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const IndustryTagSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  definition: z.string().nullish(),
  airtableRecId: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
  industryCategoryUid: z.string(),
});

export const ResponseIndustryTagSchema = IndustryTagSchema.extend({
  industryCategory: ResponseIndustryCategorySchema.optional(),
})
  .omit({ id: true })
  .strict();

export const CreateIndustryTagSchema = IndustryTagSchema.pick({
  title: true,
  definition: true,
  industryCategoryUid: true,
});

export const UpdateIndustryTagSchema = IndustryTagSchema.pick({
  title: true,
  definition: true,
  industryCategoryUid: true,
}).partial();

export const IndustryTagRelationalFields = ResponseIndustryTagSchema.pick({
  industryCategory: true,
}).strip();

export const IndustryTagQueryableFields = ResponseIndustryTagSchema.omit({
  industryCategory: true,
}).keyof();

export const IndustryTagQueryParams = QueryParams({
  queryableFields: IndustryTagQueryableFields,
  relationalFields: IndustryTagRelationalFields,
});

export const IndustryTagDetailQueryParams = IndustryTagQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export class IndustryTagDto extends createZodDto(IndustryTagSchema) {}

export class CreateIndustryTagDto extends createZodDto(
  CreateIndustryTagSchema
) {}

export class UpdateIndustryTagDto extends createZodDto(
  UpdateIndustryTagSchema
) {}

export class ResponseIndustryTagDto extends createZodDto(
  ResponseIndustryTagSchema
) {}
