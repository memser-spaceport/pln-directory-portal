import z from 'zod';
import { IAirtableTeam } from '@protocol-labs-network/airtable';

export const AirtableTeamSchema: z.ZodType<IAirtableTeam> = z.lazy(() =>
  z.object({
    id: z.string(),
    fields: z.object({
      Name: z.string(),
      'Short description': z.string().optional(),
      'Long description': z.string().optional(),
      Website: z.string().optional(),
      Twitter: z.string().optional(),
      'Network members': z.string().array().optional(),
      // Logo: IAirtableTeamLogo[].optional();
      'Tags lookup': z.string().array().optional(),
      'Last Audited': z
        .preprocess((value: string) => new Date(value), z.date())
        .optional(),
      Notes: z.string().optional(),
      'Last Modified': z
        .preprocess((value: string) => new Date(value), z.date())
        .optional(),
      'Eligible for marketplace credits': z.boolean().optional(),
      'Grants program': z.boolean().optional(),
      Blog: z.string().optional(),
      'IPFS User': z.boolean().default(false).optional(),
      'Filecoin User': z.boolean().default(false).optional(),
      Created: z.string().optional(),
      Video: z.string().optional(),
      'Funding Stage': z.string().optional(),
      'Accelerator Programs': z.string().array().optional(),
      'Friend of PLN': z.boolean().optional(),
      'Preferred Method of Contact': z.string().optional(),
    }),
  })
);
