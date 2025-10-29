import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const UpdateFundraisingTeamSchema = z.object({
  name: z.string().optional(),
  shortDescription: z.string().optional(),
  website: z.string().optional().nullable(),
  industryTags: z.array(z.string()).optional(),
  fundingStage: z.string().optional(),
  logo: z.string().optional(),
});

export class UpdateFundraisingTeamDto extends createZodDto(UpdateFundraisingTeamSchema) {}

export const UpdateFundraisingDescriptionSchema = z.object({
  description: z.string(),
});

export class UpdateFundraisingDescriptionDto extends createZodDto(UpdateFundraisingDescriptionSchema) {}

export const ExpressInterestSchema = z.object({
  teamFundraisingProfileUid: z.string(),
  interestType: z.enum(['like', 'connect', 'invest', 'referral']),
  isPrepDemoDay: z.boolean().optional(),
  referralData: z
    .object({
      investorName: z.string().optional().nullable(),
      investorEmail: z.string().optional().nullable(),
      message: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export class ExpressInterestDto extends createZodDto(ExpressInterestSchema) {}
