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

export const DemoDayFeedbackIssueType = z.enum(['TECHNICAL_ISSUES', 'ACCESS_ISSUES', 'NETWORKING_ISSUES']);

export const CreateDemoDayFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(10),
  qualityComments: z.string().optional().nullable(),
  improvementComments: z.string().optional().nullable(),
  comment: z.string().optional().nullable(),
  issues: z.array(z.union([DemoDayFeedbackIssueType, z.string()])).default([]),
});

export class CreateDemoDayFeedbackDto extends createZodDto(CreateDemoDayFeedbackSchema) {}

const optionalString = z.preprocess((val) => (val === '' || val === null ? undefined : val), z.string().optional());

const TeamInputSchema = z.object({
  uid: optionalString,
  name: optionalString,
  website: optionalString,
});

export const CreateDemoDayInvestorApplicationSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required'),
  linkedinProfile: optionalString,
  role: optionalString,
  teamUid: optionalString,
  isTeamNew: z.boolean().optional(),
  team: TeamInputSchema.optional(),
  isAccreditedInvestor: z.boolean().optional(),
  projectUid: optionalString,
});

export class CreateDemoDayInvestorApplicationDto extends createZodDto(CreateDemoDayInvestorApplicationSchema) {}
