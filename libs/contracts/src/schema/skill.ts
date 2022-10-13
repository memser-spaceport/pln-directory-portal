import { z } from 'zod';

export const SkillSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
