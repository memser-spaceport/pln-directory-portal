import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const TypeEnum = z.enum(['Ask a Question', 'Get Support', 'Give Feedback', 'Share an Idea']);

export const CustomQuestionSchema = z.object({
  email: z.string().email(),
  question: z.string(),
  type: z.string().refine((value) => TypeEnum.safeParse(value).success, {
    message: 'Invalid type',
  }),
});

export const CustomQuestionResponseSchema = z.object({
  success: z.boolean(),
});

export class CustomQuestionSchemaDto extends createZodDto(CustomQuestionSchema) {}
export class CustomQuestionResponseDto extends createZodDto(CustomQuestionResponseSchema) {}
