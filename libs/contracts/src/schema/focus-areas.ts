import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';
import { ResponseTeamFocusAreaSchema } from './team-focus-areas';
import { ResponseTeamWithRelationsSchema } from './team';
import { ResponseProjectFocusAreaSchema } from './project-focus-areas';

export const FocusAreaSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  parentUid: z.string().optional()
});

export const ResponseFocusAreaSchema = FocusAreaSchema.omit({ id: true }).strict();

export const ResponseFocusAreaWithRelationsSchema = ResponseFocusAreaSchema.extend({
  children: FocusAreaSchema.array().optional(),
  teamFocusAreas: ResponseTeamFocusAreaSchema.array().optional(),
  teamAncestorFocusAreas: ResponseTeamFocusAreaSchema.array().optional(),
  team: ResponseTeamWithRelationsSchema.optional(),
  projectFocusAreas: ResponseProjectFocusAreaSchema.array().optional(),
  projectAncestorFocusAreas: ResponseProjectFocusAreaSchema.array().optional()
});

export const FocusAreaRelationalFields = ResponseFocusAreaWithRelationsSchema.pick({
  children: true,
  teamFocusAreas: true,
  teamAncestorFocusAreas: true,
  team: true,
  projectFocusAreas: true,
  projectAncestorFocusAreas: true
}).strip();

export const FocusAreaQueryableFields = FocusAreaSchema.keyof();

export const FocusAreaQueryParams = QueryParams({
  queryableFields: FocusAreaQueryableFields,
  relationalFields: FocusAreaRelationalFields
});

export const FocusAreaDetailQueryParams = FocusAreaQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export const CreateFocusAreaSchema = FocusAreaSchema.pick({
  title: true
});

export class FocusAreaDto extends createZodDto(FocusAreaSchema) {}

export class CreateFocusAreaDto extends createZodDto(CreateFocusAreaSchema) {}

export class ResponseFocusAreaDto extends createZodDto(ResponseFocusAreaSchema) {}

export type TFocusAreaResponse = z.infer<typeof ResponseFocusAreaSchema>;
