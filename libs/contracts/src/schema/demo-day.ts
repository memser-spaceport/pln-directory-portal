import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const UpdateFundraisingTeamSchema = z.object({
  name: z.string().optional(),
  shortDescription: z.string().optional(),
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
      investorName: z.string().optional(),
      investorEmail: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
});

export class ExpressInterestDto extends createZodDto(ExpressInterestSchema) {}
