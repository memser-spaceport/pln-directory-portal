import { z, ZodDate, ZodEffects } from 'zod';
import { IAirtableMember } from '@protocol-labs-network/airtable';

export const AirtableMemberSchema: z.ZodType<IAirtableMember> = z.lazy(() =>
  z.object({
    id: z.string(),
    fields: z.object({
      Name: z.string(),
      'Display Name': z.string().optional(),
      'PLN Start Date': (
        z.preprocess((value: string) => new Date(value), z.date()) as unknown as ZodEffects<ZodDate, Date, undefined>
      ).optional(),
      'PLN End Date': (
        z.preprocess((value: string) => new Date(value), z.date()) as unknown as ZodEffects<ZodDate, Date, undefined>
      ).optional(),
      // 'Profile picture'?: IAirtableMemberPicture[];
      Skills: z.string().array().optional(),
      'Github Handle': z.string().optional(),
      'Office hours link': z.string().optional(),
      'Team lead': z.boolean().optional(),
      Teams: z.string().array().optional(),
      Role: z.string().optional(),
      Location: z.string().optional(),
      Email: z.string().optional(),
      Twitter: z.string().optional(),
      'Discord handle': z.string().optional(),
      Notes: z.string().optional(),
      'Date contacted': (
        z.preprocess((value: string) => new Date(value), z.date()) as unknown as ZodEffects<ZodDate, Date, undefined>
      ).optional(),
      'State / Province': z.string().optional(),
      Country: z.string().optional(),
      City: z.string().optional(),
      Created: z.string().optional(),
      Technology: z.string().array().optional(),
      'Did we miss something?': z.string().optional(),
      'Notes INTERNAL': z.string().optional(),
      'Tagged in Discord': z.boolean().optional(),
      'What industry or industries do you specialize in?': z.string().array().optional(),
      'Professional Functions': z.string().array().optional(),
      'Metro Area': z.string().optional(),
      'Location backup': z.string().optional(),
      'Friend of PLN': z.boolean().optional(),
      'Team name': z.string().array().optional(),
      Region: z.string().optional(),
    }),
  })
);
