import { z } from "zod";
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';
import { ResponseMemberSchema } from "./member";

export const ExperienceSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable().optional(),
  startDate: z.any(), 
  endDate: z.any(),   
  isCurrent: z.boolean(),
  experience: z.any(), 
  isFlaggedByUser: z.boolean(),
  isModifiedByUser: z.boolean(),
  userUpdatedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  memberUid: z.string(),
});

export const ResponseExperienceSchema = ExperienceSchema.omit({ id: true }).strict();

export const ResponseExperienceSchemaWithRelationsSchema = ResponseExperienceSchema.extend({
  member: z.lazy(() => ResponseMemberSchema).optional(),
});

export const ExperienceRelationalFields = ResponseExperienceSchemaWithRelationsSchema.pick({
  member: true,
}).strip();

export const ExperienceQueryableFields = ResponseExperienceSchema.keyof();

export const ExperienceQueryParams = QueryParams({
  queryableFields: ExperienceQueryableFields,
  relationalFields: ExperienceRelationalFields
});

export const ExperienceDetailQueryParams = ExperienceQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

