import { z,  } from "zod";
import { createZodDto } from '@abitia/zod-dto';
import { ResponsePLEventGuestSchema } from "./pl-event-guest";
import { ResponseImageSchema } from "./image";
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

export const PLEventSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
  telegramId: z.string().optional(),
  eventsCount: z.number().int(),
  logoUid: z.string().nullish(),
  bannerUid: z.string().nullish(),
  description: z.string().optional(),
  websiteURL: z.string().url().optional(),
  slugURL: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const PLCreateEventSchema = PLEventSchema.pick({
  name: true,
  description: true,
  telegramId: true,
  websiteURL: true,
  logoUid: true,
  bannerUid: true
});

export const ResponsePLEventSchema = PLEventSchema.omit({ id: true }).strict();

export const ResponsePLEventSchemaWithRelationsSchema = ResponsePLEventSchema.extend({
  logo: ResponseImageSchema.optional(),
  banner: ResponseImageSchema.optional(),
  eventGuests: ResponsePLEventGuestSchema.array().optional()
});

export const PLEventRelationalFields = ResponsePLEventSchemaWithRelationsSchema.pick({
  logo: true,
  banner: true,
  eventGuests: true
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