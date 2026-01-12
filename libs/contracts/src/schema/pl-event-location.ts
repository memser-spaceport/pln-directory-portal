import { z } from 'zod';
import { ResponsePLEventSchemaWithRelationsSchema } from './pl-event';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';
import { createZodDto } from '@abitia/zod-dto';

export const PLEventLocationSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  location: z.string(),
  description: z.string().optional().nullable(),
  country: z.string(),
  latitude: z.string().optional().nullable(),
  longitude: z.string().optional().nullable(),
  flag: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  resources: z.array(
    z.object({ 
      name: z.string(), 
      link: z.string().url(),
      description: z.string().optional()
    })
  ).optional(),
  additionalInfo: z.any(),
  priority: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  timezone: z.string(),
});

export const PLCreateEventLocationSchema = PLEventLocationSchema.pick({
  location: true,
  description: true,
  country: true,
  latitude: true,
  longitude: true,
  flag: true,
  icon: true,
  resources: true,
  additionalInfo: true,
  priority: true,
  timezone: true
});

export const ResponsePLEventLocationSchema = PLEventLocationSchema.omit({ id: true }).strict();

export const ResponsePLEventLocationWithRelationsSchema = ResponsePLEventLocationSchema.extend({
  // events: ResponsePLEventSchemaWithRelationsSchema.array().optional()
});

export const PLEventLocationRelationalFields = ResponsePLEventLocationWithRelationsSchema.pick({
  // events: true
}).strip();

export const PLEventLocationQueryableFields = ResponsePLEventLocationSchema.keyof();

export const PLEventLocationQueryParams = QueryParams({
  queryableFields: PLEventLocationQueryableFields,
  relationalFields: PLEventLocationRelationalFields
});

export const PLEventLocationDetailQueryParams = PLEventLocationQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export const UpdateIRLAggregatedPriority = z.object({
  locations: z.array(z.object({
    uid: z.string(),
    aggregatedPriority: z.number().int(),
    isAggregated: z.boolean()
  })).optional(),
  events: z.array(z.object({
    uid: z.string(),
    aggregatedPriority: z.number().int(),
    isAggregated: z.boolean()
  })).optional()
});

export const UpdatePLEventLocationSchema = z.object({
  location: z.string().optional(),
  description: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  latitude: z.string().optional().nullable(),
  longitude: z.string().optional().nullable(),
  flag: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  resources: z.array(
    z.object({ 
      name: z.string(), 
      link: z.string().url(),
      description: z.string().optional()
    })
  ).optional(),
  additionalInfo: z.any().optional(),
  priority: z.number().int().optional().nullable(),
  timezone: z.string().optional(),
  isFeatured: z.boolean().optional().nullable(),
  isAggregated: z.boolean().optional(),
  aggregatedPriority: z.number().int().optional().nullable(),
});

export class CreatePLEventLocationSchemaDto extends createZodDto(PLCreateEventLocationSchema) {}
export class UpdatePLEventLocationSchemaDto extends createZodDto(UpdatePLEventLocationSchema) {}

export class UpdateIRLAggregatedPriorityDto extends createZodDto(UpdateIRLAggregatedPriority) {}

