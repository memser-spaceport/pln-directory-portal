import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

const CustomQuestionSchema = z.object({
  email: z.string().email(),
  question: z.string().max(200)
});

const CustomQuestionResponseSchema = z.object({
  success: z.boolean()
});

export class CustomQuestionSchemaDto extends createZodDto(CustomQuestionSchema) {}
export class CustomQuestionResponseDto extends createZodDto(CustomQuestionResponseSchema) {}