import { z } from "zod";
import { createZodDto } from '@abitia/zod-dto';
import { QueryParams } from './query-params';
import { ResponseMemberSchema } from './member'; 
import { ResponseTeamSchema  } from "./team";

export const CreatePLEventGuestSchema = z.object({
  teamUid: z.string(),
  memberUid: z.string(),
  telegramId: z.string().optional(),
  reason: z.string().optional(),
  additionalInfo: z.any(),
  topics: z.array(z.string()).optional(),
  officeHours: z.string(),
  events: z.array(z.object({
    uid: z.string(),
    isHost: z.boolean().optional(),
    isSpeaker: z.boolean().optional(),
    hostSubEvents: z.array(
      z.object({
        name: z.string(),
        link: z.string().url(),
      })
    ).optional(),
    speakerSubEvents: z.array(
      z.object({
        name: z.string(),
        link: z.string().url(),
    })).optional()
  }))
});

export const PLEventGuestSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  teamUid: z.string(),
  eventUid: z.string(),
  memberUid: z.string(),
  telegramId: z.string().nullish(),
  reason: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
  additionalInfo: z.any(),
  topics: z.array(z.string()).nullish(),
  isFeatured: z.boolean().nullish(),
  isHost: z.boolean().nullish(),
  isSpeaker: z.boolean().nullish(),
  priority: z.number().int().nullish()
});

export const ResponsePLEventGuestSchema = PLEventGuestSchema.omit({ id: true }).strict();

export const ResponsePLEventGuestSchemaWithRelationsSchema = ResponsePLEventGuestSchema.extend({
  member: ResponseMemberSchema.optional(),
  team: ResponseTeamSchema.optional(),
});

export const PLEventGuestRelationalFields = ResponsePLEventGuestSchemaWithRelationsSchema.pick({
  member: true,
  team: true,
  priority: true
}).strip();

export const PLEventGuestQueryableFields = PLEventGuestRelationalFields.keyof();

export const PLEventGuestQueryParams = QueryParams({
  queryableFields: PLEventGuestQueryableFields,
  relationalFields: PLEventGuestRelationalFields,
});

export const DeletePLEventGuestsSchema = z.object({
  membersAndEvents: z.array(
    z.object({
      memberUid: z.string(),
      eventUid: z.string()
    }
  ))
});

export class CreatePLEventGuestSchemaDto extends createZodDto(CreatePLEventGuestSchema) {}
export class UpdatePLEventGuestSchemaDto extends createZodDto(CreatePLEventGuestSchema) {}
export class DeletePLEventGuestsSchemaDto extends createZodDto(DeletePLEventGuestsSchema) {}