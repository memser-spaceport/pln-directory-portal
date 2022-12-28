import z from 'zod';

export const AirtableIndustryTagSchema = z.object({
  id: z.string(),
  fields: z.object({
    Tags: z.string(),
    Definition: z.string().optional(),
    Categories: z.string().array().optional(),
  }),
});
