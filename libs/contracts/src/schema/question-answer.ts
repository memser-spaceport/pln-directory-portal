import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';
import { ResponseMemberWithRelationsSchema } from './member';
import { ResponseTeamWithRelationsSchema } from './team';
import { ResponsePLEventSchemaWithRelationsSchema } from './pl-event'; 


export const QuestionAndAnswerSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string().optional(),
  content: z.string(),
  viewCount: z.number().int(),
  shareCount: z.number().int(),
  isActive: z.boolean().default(true),
  teamUid: z.string().nullish(),
  eventUid: z.string().nullish(),
  projectUid: z.string().nullish(),
  answer: z.string().optional(),
  answerSources: z.any().optional(),
  relatedQuestions: z.any().optional(),
  answerSourceFrom: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CreateQuestionAndAnswerSchema = QuestionAndAnswerSchema.pick({
  title: true,
  content: true,
  viewCount: true,
  shareCount: true,
  isActive: true,
  teamUid: true,
  eventUid: true,
  projectUid: true,
  answer: true,
  relatedQuestions: true,
  answerSources: true,
  answerSourceFrom:true
});

export const ResponseQuestionAndAnswerSchema = QuestionAndAnswerSchema.omit({ id: true }).strict();

export const ResponseQuestionAndAnswerSchemaWithRelations = ResponseQuestionAndAnswerSchema.extend({
  team: ResponseTeamWithRelationsSchema.optional(),
  plevent: ResponsePLEventSchemaWithRelationsSchema.optional(), 
  creator: ResponseMemberWithRelationsSchema.optional(),
  modifier: ResponseMemberWithRelationsSchema.optional()
});

export const QuestionAndAnswerRelationalFields = ResponseQuestionAndAnswerSchemaWithRelations.pick({
  team: true,
  creator: true,
  modifier: true
}).strip();

export const QuestionAndAnswerQueryableFields = ResponseQuestionAndAnswerSchema.keyof();

export const QuestionAndAnswerQueryParams = QueryParams({
  queryableFields: QuestionAndAnswerQueryableFields,
  relationalFields: QuestionAndAnswerRelationalFields
});

export const QuestionAndAnswerDetailQueryParams = QuestionAndAnswerQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

export class CreateQuestionAndAnswerSchemaDto extends createZodDto(CreateQuestionAndAnswerSchema) {}
export class UpdateQuestionAndAnswerSchemaDto extends createZodDto(CreateQuestionAndAnswerSchema) {}