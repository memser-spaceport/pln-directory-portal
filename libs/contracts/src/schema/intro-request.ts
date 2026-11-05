import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const INTRO_REQUEST_TEXT_MAX_LENGTH = 4000;

const CreateIntroRequestSchema = z.object({
  type: z.enum(['MEMBER', 'TEAM']),
  targetId: z.string().min(1),
  text: z.string().trim().min(1).max(INTRO_REQUEST_TEXT_MAX_LENGTH),
});

const CreateIntroRequestResponseSchema = z.object({
  uid: z.string(),
});

export class CreateIntroRequestDto extends createZodDto(CreateIntroRequestSchema) {}
export class CreateIntroRequestResponseDto extends createZodDto(CreateIntroRequestResponseSchema) {}
