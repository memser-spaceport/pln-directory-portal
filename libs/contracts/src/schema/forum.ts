import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const ForumAccessResponseSchema = z.object({
  hasAccess: z.boolean(),
});

export class ForumAccessResponseDto extends createZodDto(ForumAccessResponseSchema) {}
