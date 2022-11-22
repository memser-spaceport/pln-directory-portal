import { z } from 'zod';
import { QueryParams } from './query-params';

export const LocationSchema = z
  .object({
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
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export const LocationResponseSchema = LocationSchema.omit({ id: true });

export const LocationQueryableFields = LocationResponseSchema.keyof();

export const LocationQueryParams = QueryParams({
  queryableFields: LocationQueryableFields,
});
