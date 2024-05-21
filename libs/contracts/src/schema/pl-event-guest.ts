import { z } from "zod";
import { createZodDto } from '@abitia/zod-dto';
import { QueryParams } from './query-params';
import { ResponseMemberSchema } from './member'; 
import { ResponseTeamSchema  } from "./team";

export const PLEventGuestSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  teamUid: z.string(),
  eventUid: z.string(),
  memberUid: z.string(),
  telegramId: z.string().optional(),
  reason: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  additionalInfo: z.any(),
  topics: z.array(z.string()).optional()
});

export const CreatePLEventGuestSchema = PLEventGuestSchema.pick({
  teamUid: true,
  telegramId: true,
  reason: true,
  additionalInfo: true,
  topics: true
});

export const ResponsePLEventGuestSchema = PLEventGuestSchema.omit({ id: true }).strict();

export const ResponsePLEventGuestSchemaWithRelationsSchema = ResponsePLEventGuestSchema.extend({
  member: ResponseMemberSchema.optional(),
  team: ResponseTeamSchema.optional()
});

export const PLEventGuestRelationalFields = ResponsePLEventGuestSchemaWithRelationsSchema.pick({
  member: true,
  team: true
}).strip();

export const PLEventGuestQueryableFields = PLEventGuestRelationalFields.keyof();

export const PLEventGuestQueryParams = QueryParams({
  queryableFields: PLEventGuestQueryableFields,
  relationalFields: PLEventGuestRelationalFields,
});

export class CreatePLEventGuestSchemaDto extends createZodDto(CreatePLEventGuestSchema) {}
export class UpdatePLEventGuestSchemaDto extends createZodDto(CreatePLEventGuestSchema) {}
