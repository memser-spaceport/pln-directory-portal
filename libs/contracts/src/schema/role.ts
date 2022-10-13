import { z } from 'zod';

export const RoleSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  startDate: z.date().nullish(),
  endDate: z.date().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
