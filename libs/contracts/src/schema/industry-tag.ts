import { z } from 'zod';

export const IndustryTagSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  definition: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
  industryCategoryUid: z.string(),
});
