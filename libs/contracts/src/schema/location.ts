import { z } from 'zod';

export const LocationSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  city: z.string().nullish(),
  country: z.string(),
  continent: z.string(),
  region: z.string().nullish(),
  regionAbbreviation: z.string().nullish(),
  formattedAddress: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
