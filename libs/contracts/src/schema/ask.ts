// import { z } from 'zod';
// import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

// export const AskSchema = z.object({
//   id: z.number().int(),
//   uid: z.string(),
//   title: z.string(),
//   description: z.string(),
//   tags:z.array(z.string()),
//   teamUid: z.string(),
//   projectUid: z.string(),
//   createdAt: z.date(),
//   updatedAt: z.date(),
// });

// export const ResponseAskSchema = AskSchema.omit({
//   id: true,
// }).strict();

// export const AskQueryableFields = ResponseAskSchema.keyof();

// export const AskQueryParams = QueryParams({
//   queryableFields: AskQueryableFields,
// });

// export const AskDetailQueryParams = AskQueryParams.unwrap()
//   .pick(RETRIEVAL_QUERY_FILTERS)
//   .optional();



import { z,  } from "zod";
import { createZodDto } from '@abitia/zod-dto';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';
import { ResponseTeamSchema } from "./team";
import { ResponseProjectSchema } from "./project";

export const AskSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  description: z.string(),
  tags:z.any(),
  teamUid: z.string(),
  projectUid: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});


export const ResponseAskSchema = AskSchema.omit({ id: true }).strict();

export const ResponseAskSchemaWithRelationsSchema = ResponseAskSchema.extend({
  team: z.lazy(() => ResponseTeamSchema).optional(),
  project: z.lazy(() => ResponseProjectSchema).optional()
});

export const AskRelationalFields = ResponseAskSchemaWithRelationsSchema.pick({
  team: true,
  project: true,
}).strip();

export const AskQueryableFields = ResponseAskSchema.keyof();

export const AskQueryParams = QueryParams({
  queryableFields: AskQueryableFields,
  relationalFields: AskRelationalFields
});

export const AskDetailQueryParams = AskQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();

// export class CreatePLEventSchemaDto extends createZodDto(PLCreateEventSchema) {}
