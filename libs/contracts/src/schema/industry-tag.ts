import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const IndustryTagSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  definition: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
  industryCategoryUid: z.string(),
});

export const ResponseIndustryTagSchema = IndustryTagSchema.omit({ id: true });

export const CreateIndustryTagSchema = IndustryTagSchema.pick({
  title: true,
  definition: true,
  industryCategoryUid: true,
});

export class IndustryTagDto extends createZodDto(IndustryTagSchema) {}

export class CreateIndustryTagDto extends createZodDto(
  CreateIndustryTagSchema
) {}

export class ResponseIndustryTagDto extends createZodDto(
  ResponseIndustryTagSchema
) {}
