import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { UpdateFundraisingTeamSchema } from './demo-day';

export const TeamPitchExpressInterestSchema = z.object({
  interestType: z.enum(['connect', 'invest', 'referral', 'feedback']),
  isPrep: z.boolean().optional().default(false),
  teamPitchProfileUid: z.string().optional(),
  referralData: z
    .object({
      investorName: z.string().optional().nullable(),
      investorEmail: z.string().email().optional().nullable(),
      message: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  feedbackData: z
    .object({
      feedback: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export class TeamPitchExpressInterestDto extends createZodDto(TeamPitchExpressInterestSchema) {}

export const UpdateTeamPitchProfileSchema = z.object({
  description: z.string().optional().nullable(),
});

export class UpdateTeamPitchProfileDto extends createZodDto(UpdateTeamPitchProfileSchema) {}

export const UpdateTeamPitchTeamSchema = UpdateFundraisingTeamSchema;

export class UpdateTeamPitchTeamDto extends createZodDto(UpdateTeamPitchTeamSchema) {}

export const TeamPitchConfidentialitySchema = z.object({
  accepted: z.boolean(),
});

export class TeamPitchConfidentialityDto extends createZodDto(TeamPitchConfidentialitySchema) {}
