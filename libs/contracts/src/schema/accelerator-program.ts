import { z } from 'zod';

export const AcceleratorProgramSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
