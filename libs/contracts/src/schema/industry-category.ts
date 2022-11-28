import { z } from 'zod';

export const IndustryCategorySchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ResponseIndustryCategorySchema = IndustryCategorySchema.omit({
  id: true,
}).strict();
