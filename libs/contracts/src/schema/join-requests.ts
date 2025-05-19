import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const JoinRequestSchema = z.object({
  email: z.string().email(),
  introduction: z.string() 
});

export const JoinRequestResponseSchema = z.object({
  success: z.boolean()
});

export class JoinRequestSchemaDto extends createZodDto(JoinRequestSchema) {}
export class JoinRequestResponseDto extends createZodDto(JoinRequestResponseSchema) {}