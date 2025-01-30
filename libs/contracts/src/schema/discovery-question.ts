import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';
import { ResponseMemberWithRelationsSchema } from './member';
import { ResponseTeamWithRelationsSchema } from './team';
import { ResponsePLEventSchemaWithRelationsSchema } from './pl-event'; 

export const DiscoveryQuestionSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string().optional(),
  content: z.string(),
  viewCount: z.number().int(),
  shareCount: z.number().int(),
  isActive: z.boolean().default(true),
  teamUid: z.string().nullish(),
  teamName: z.string().nullish(),
  eventUid: z.string().nullish(),
  eventName: z.string().nullish(),
  projectUid: z.string().nullish(),
  projectName: z.string().nullish(),
  answer: z.string().optional(),
  answerSources: z.any().optional(),
  relatedQuestions: z.any().optional(),
  answerSourceFrom: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  type: z.enum(['CHAT']).nullish().optional()
});

export const CreateDiscoveryQuestionSchema = DiscoveryQuestionSchema.pick({
  title: true,
  content: true,
  viewCount: true,
  shareCount: true,
  isActive: true,
  teamUid: true,
  teamName: true,
  eventUid: true,
  eventName: true,
  projectUid: true,
  projectName: true,
  answer: true,
  relatedQuestions: true,
  answerSources: true,
  answerSourceFrom:true,
  type: true
});

export const ResponseDiscoveryQuestionSchema = DiscoveryQuestionSchema.omit({ id: true }).strict();

export const ResponseDiscoveryQuestionSchemaWithRelations = ResponseDiscoveryQuestionSchema.extend({
  team: ResponseTeamWithRelationsSchema.optional(),
  plevent: ResponsePLEventSchemaWithRelationsSchema.optional(), 
  creator: ResponseMemberWithRelationsSchema.optional(),
  modifier: ResponseMemberWithRelationsSchema.optional()
});

export const DiscoveryQuestionRelationalFields = ResponseDiscoveryQuestionSchemaWithRelations.pick({
  team: true,
  creator: true,
  modifier: true
}).strip();

export const DiscoveryQuestionQueryableFields = ResponseDiscoveryQuestionSchema.keyof();

export const DiscoveryQuestionQueryParams = QueryParams({
  queryableFields: DiscoveryQuestionQueryableFields,
  relationalFields: DiscoveryQuestionRelationalFields
});

export const DiscoveryQuestionDetailQueryParams = DiscoveryQuestionQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export class CreateDiscoveryQuestionSchemaDto extends createZodDto(CreateDiscoveryQuestionSchema) {}
export class UpdateDiscoveryQuestionSchemaDto extends createZodDto(CreateDiscoveryQuestionSchema) {}
