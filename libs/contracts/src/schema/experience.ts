import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const ExperienceSchema = z.object({
    companyName: z.string().nullish(),
    logoUid: z.string().optional(), 
    title: z.string().nullish(),    
    currentTeam: z.boolean().nullish(),
    startDate: z.string().nullish(),
    endDate: z.string().nullish(),
    description: z.string().optional(),    
    memberUid: z.string().optional()
})

export const RefinedExperienceSchema = ExperienceSchema;

RefinedExperienceSchema.superRefine((data, ctx) => {
  if (data.currentTeam) {
    data.endDate = null;
  } else {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'end date should not be null for past experience',
      fatal: true,
    });
    
  }
  return z.never;
});

export const ResponseExperienceSchema = ExperienceSchema.omit({}).strict();

export const ExperienceQueryableFields = ResponseExperienceSchema.keyof();

export const ExperienceQueryParams = QueryParams({
  queryableFields: ExperienceQueryableFields,
});

export const ExperienceDetailQueryParams = ExperienceQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export const CreateExperienceSchema = ExperienceSchema.pick({
  title: true,
  companyName: true,
  currentTeam: true,
  startDate: true,
  endDate: true,
  description: true,
});

export class ExperienceDto extends createZodDto(ExperienceSchema) {}

export class CreateExperienceDto extends createZodDto(CreateExperienceSchema) {}

export class ResponseExperienceDto extends createZodDto(ResponseExperienceSchema) {}

export type TExperienceResponse = z.infer<typeof ResponseExperienceSchema>;
