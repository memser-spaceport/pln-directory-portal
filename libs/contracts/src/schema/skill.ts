import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const SkillSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ResponseSkillSchema = SkillSchema.omit({ id: true });

export const CreateSkillSchema = SkillSchema.pick({
  title: true,
  description: true,
});

export class SkillDto extends createZodDto(SkillSchema) {}

export class CreateSkillDto extends createZodDto(CreateSkillSchema) {}

export class ResponseSkillDto extends createZodDto(ResponseSkillSchema) {}
