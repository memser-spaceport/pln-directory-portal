import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';
import { QueryParams } from './query-params';
import { ResponseTeamSchema } from './team';
import { ResponseProjectSchema } from './project';

export const AskStatusEnum = z.enum(['OPEN', 'CLOSED']);

export const CreateAskSchema = z.object({
  title: z.string().min(7, 'Title must be minimum 7 characters'),
  description: z.string().min(10, 'Description must be minimum 10 characters'),
  tags: z.array(z.string()).optional().default([]),
});

export const UpdateAskSchema = z.object({
  title: z.string().min(7, 'Title must be minimum 7 characters').optional(),
  description: z.string().min(10, 'Description must be minimum 10 characters').optional(),
  tags: z.array(z.string()).optional(),
});

export const CloseAskSchema = z.object({
  closedReason: z.string().min(7, 'Closed reason must be minimum 7 character'),
  closedComment: z.string().optional(),
  closedByUid: z.string().optional(),
});

export const AskSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  description: z.string(),
  tags: z.any(),
  teamUid: z.string().nullable(),
  projectUid: z.string().nullable(),
  status: AskStatusEnum,
  closedAt: z.date().nullable(),
  closedReason: z.string().nullable(),
  closedComment: z.string().nullable(),
  closedByUid: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ResponseAskSchema = AskSchema.omit({ id: true }).strict();

export const ResponseAskSchemaWithRelationsSchema = ResponseAskSchema.extend({
  team: z.lazy(() => ResponseTeamSchema).optional(),
  project: z.lazy(() => ResponseProjectSchema).optional(),
});

export const AskRelationalFields = ResponseAskSchemaWithRelationsSchema.pick({
  team: true,
  project: true,
  closedBy: true,
}).strip();

export const AskQueryableFields = ResponseAskSchema.keyof();

export const AskQueryParams = QueryParams({
  queryableFields: AskQueryableFields,
  relationalFields: AskRelationalFields,
});

// DTO Classes for use in controllers
export class CreateAskDto extends createZodDto(CreateAskSchema) {}
export class UpdateAskDto extends createZodDto(UpdateAskSchema) {}
export class CloseAskDto extends createZodDto(CloseAskSchema) {}
export class ResponseAskDto extends createZodDto(ResponseAskSchema) {}
export class ResponseAskWithRelationsDto extends createZodDto(ResponseAskSchemaWithRelationsSchema) {}
