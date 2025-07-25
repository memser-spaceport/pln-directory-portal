import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const LocationSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  placeId: z.string(),
  city: z.string().nullish(),
  country: z.string().nullish(),
  continent: z.string(),
  region: z.string().nullish(),
  regionAbbreviation: z.string().nullish(),
  metroArea: z.string().nullish(),
  latitude: z.number(),
  longitude: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const LocationAutocompleteQuerySchema = z.object({
  query: z.string().min(1),
});

export const LocationAutocompleteResponseSchema = z.object({
  description: z.string().min(1),
  placeId: z.string().min(1),
});

export const LocationResponseSchema = LocationSchema.omit({
  id: true,
}).strict();

export const LocationQueryableFields = LocationResponseSchema.keyof();

export const LocationQueryParams = QueryParams({
  queryableFields: LocationQueryableFields,
});

export const LocationDetailQueryParams = LocationQueryParams.unwrap().pick(RETRIEVAL_QUERY_FILTERS).optional();

export type TLocationResponse = z.infer<typeof LocationResponseSchema>;
export class ValidateLocationDto extends createZodDto(
  LocationSchema.pick({ city: true, region: true, country: true })
) {}

export class LocationAutocompleteResponseDto extends createZodDto(LocationAutocompleteResponseSchema) {}

export class LocationAutocompleteQueryDto extends createZodDto(LocationAutocompleteQuerySchema) {}
