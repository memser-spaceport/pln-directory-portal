import z from 'zod';
import { IAirtableIndustryTag } from '@protocol-labs-network/airtable';

export const AirtableIndustryTagSchema: z.ZodType<IAirtableIndustryTag> =
  z.lazy(() =>
    z.object({
      id: z.string(),
      fields: z.object({
        Tags: z.string(),
        Definition: z.string().optional(),
        Categories: z.string().array().optional(),
      }),
    })
  );
