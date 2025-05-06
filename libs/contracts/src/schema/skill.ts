import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const SkillSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string().optional(),
  name: z.string().optional(),
  description: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ResponseSkillSchema = SkillSchema.omit({ id: true }).strict();

export const SkillQueryableFields = ResponseSkillSchema.keyof();

export const SkillQueryParams = QueryParams({
  queryableFields: SkillQueryableFields,
});

export const SkillDetailQueryParams = SkillQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export const CreateSkillSchema = SkillSchema.pick({
  title: true,
  description: true,
});

export class SkillDto extends createZodDto(SkillSchema) {}

export class CreateSkillDto extends createZodDto(CreateSkillSchema) {}

export class ResponseSkillDto extends createZodDto(ResponseSkillSchema) {}

export type TSkillResponse = z.infer<typeof ResponseSkillSchema>;
