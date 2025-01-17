import { z,  } from "zod";
import { createZodDto } from '@abitia/zod-dto';
import { ResponsePLEventGuestSchema } from "./pl-event-guest";
import { ResponseImageSchema } from "./image";
import { ResponsePLEventLocationSchema } from "./pl-event-location"
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const PLEventSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
  type: z.enum(['INVITE_ONLY']).optional(),
  telegramId: z.string().optional(),
  officeHours: z.string().optional(),
  eventsCount: z.number().int().optional(),
  logoUid: z.string().nullish(),
  bannerUid: z.string().nullish(),
  isFeatured: z.boolean().nullish(),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  websiteURL: z.string().url().optional(),
  slugURL: z.string(),
  resources: z.array(
    z.object({ 
      name: z.string(), 
      link: z.string().url(),
      description: z.string().optional()
    })
  ).optional(),
  priority: z.number().optional(),
  additionalInfo: z.any().optional(),
  startDate: z.string(),
  endDate: z.string(),
  locationUid: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const PLCreateEventSchema = PLEventSchema.pick({
  name: true,
  type: true,
  telegramId: true,
  officeHours: true,
  eventsCount: true,
  logoUid: true,
  bannerUid: true,
  isFeatured: true,
  description: true,
  shortDescription: true,
  websiteURL: true,
  slugURL: true,
  resources: true,
  priority: true,
  additionalInfo: true,
  startDate: true,
  endDate: true,
  locationUid: true,
  createdAt: true,
  updatedAt: true
});


export const ResponsePLEventSchema = PLEventSchema.omit({ id: true }).strict();

export const ResponsePLEventSchemaWithRelationsSchema = ResponsePLEventSchema.extend({
  logo: ResponseImageSchema.optional(),
  banner: ResponseImageSchema.optional(),
  eventGuests: ResponsePLEventGuestSchema.array().optional(),
  location: ResponsePLEventLocationSchema.optional()
});

export const PLEventRelationalFields = ResponsePLEventSchemaWithRelationsSchema.pick({
  logo: true,
  banner: true,
  eventGuests: true,
  location: true
}).strip();

export const PLEventQueryableFields = ResponsePLEventSchema.keyof();

export const PLEventQueryParams = QueryParams({
  queryableFields: PLEventQueryableFields,
  relationalFields: PLEventRelationalFields
});

export const PLEventDetailQueryParams = PLEventQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export class CreatePLEventSchemaDto extends createZodDto(PLCreateEventSchema) {}
