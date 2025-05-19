import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const CreateHuskyThreadSchema = z.object({
  threadId: z.string(),
});

export const DuplicateThreadSchema = z.object({
  guestUserId: z.string().optional(),
});

export const UpdateThreadBasicInfoSchema = z.object({
  question: z.string(),
});

export class CreateHuskyThreadDto extends createZodDto(CreateHuskyThreadSchema) {}
export class DuplicateThreadDto extends createZodDto(DuplicateThreadSchema) {}
export class UpdateThreadBasicInfoDto extends createZodDto(UpdateThreadBasicInfoSchema) {}
