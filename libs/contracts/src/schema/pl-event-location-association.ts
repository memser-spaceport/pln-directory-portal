import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';
import { ResponsePLEventLocationSchema } from './pl-event-location';

export const PLEventLocationAssociationSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  locationUid: z.string(),
  googlePlaceId: z.string(),
  locationName: z.string(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isDeleted: z.boolean(),
});

export const CreateLocationAssociationSchema = z.object({
  locationUid: z.string(),
  googlePlaceId: z.string(),
  locationName: z.string(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
});

export const UpdatePLEventLocationAssociationSchema = z.object({
  locationUid: z.string().optional(),
  googlePlaceId: z.string().optional(),
  locationName: z.string().optional(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
});

export const ResponsePLEventLocationAssociationSchema = PLEventLocationAssociationSchema.omit({ id: true }).strict();

export const ResponsePLEventLocationAssociationWithRelationsSchema = ResponsePLEventLocationAssociationSchema.extend({
  location: ResponsePLEventLocationSchema.optional(),
});

export class createLocationAssociationSchemaDto extends createZodDto(CreateLocationAssociationSchema) {}
export class UpdatePLEventLocationAssociationSchemaDto extends createZodDto(UpdatePLEventLocationAssociationSchema) {}
export class ResponsePLEventLocationAssociationSchemaDto extends createZodDto(ResponsePLEventLocationAssociationWithRelationsSchema) {}

