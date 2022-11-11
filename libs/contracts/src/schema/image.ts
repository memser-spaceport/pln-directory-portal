import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const ImageSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  cid: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  url: z.string(),
  filename: z.string(),
  size: z.number().int(),
  type: z.string(),
  version: z.string(),
  thumbnailToUid: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateImageSchema = z.object({
  name: z.string(),
  size: z.number(),
  type: z.string(),
});

export const ResponseImageSchema = ImageSchema.omit({ id: true }).strict();

export const ResponseCreateImageSchema = z.object({
  image: ResponseImageSchema.extend({
    thumbnails: ResponseImageSchema.array(),
  }),
});

export class CreateImageDto extends createZodDto(CreateImageSchema) {}

export class ResponseImageDto extends createZodDto(ResponseImageSchema) {}
