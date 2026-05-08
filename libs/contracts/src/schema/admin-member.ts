import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export enum MemberState {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const MemberStateDescriptions: Record<MemberState, string> = {
  [MemberState.PENDING]: 'Account created and pending review',
  [MemberState.VERIFIED]: 'Linkedin verification complete and pending final approval',
  [MemberState.APPROVED]: 'Approved member with product access',
  [MemberState.REJECTED]: 'Member request was rejected',
};

export const RequestMembersSchema = z.object({
  memberState: z
    .string()
    .transform((val) => val.split(',').map((v) => v.trim()))
    .refine((arr) => arr.length > 0, { message: 'memberState must contain at least one value' })
    .optional(),
  policyCodes: z
    .string()
    .transform((val) => val.split(',').map((v) => v.trim()))
    .refine((arr) => arr.length > 0, { message: 'policyCodes must contain at least one value' })
    .optional(),
  policyGroups: z
    .string()
    .transform((val) => val.split(',').map((v) => v.trim()))
    .refine((arr) => arr.length > 0, { message: 'policyGroups must contain at least one value' })
    .optional(),
  policyRoles: z
    .string()
    .transform((val) => val.split(',').map((v) => v.trim()))
    .refine((arr) => arr.length > 0, { message: 'policyRoles must contain at least one value' })
    .optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  /** Server-side filter: name, email, uid (substring), project name */
  search: z.string().optional(),
  /** Default when omitted + sortOrder omitted: createdAt desc (newest first) */
  sortBy: z.enum(['createdAt', 'updatedAt', 'name']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const CreateMemberSchema = z.object({
  name: z.string(),
  memberState: z.nativeEnum(MemberState).optional(),
  email: z.string().email(),
  imageUid: z.string().nullable(),
  joinDate: z.string().nullable(),
  bio: z.string().nullable(),
  aboutYou: z.string().nullable(),

  country: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),

  skills: z.array(z.string()),

  teamOrProjectURL: z.string().url().nullable(),

  teamMemberRoles: z.array(
    z.object({
      teamUid: z.string(),
      role: z.string(),
    })
  ),

  githubHandler: z.string().nullable(),
  discordHandler: z.string().nullable(),
  twitterHandler: z.string().nullable(),
  linkedinHandler: z.string().nullable(),
  telegramHandler: z.string().nullable(),
  officeHours: z.string().nullable(),
  ohInterest: z.array(z.string()).default([]),
  ohHelpWith: z.array(z.string()).default([]),

  investorProfile: z
    .object({
      secRulesAccepted: z.boolean().optional(),
      investmentFocus: z.array(z.string()),
      typicalCheckSize: z.number().nullable(),
      type: z.string().optional().nullable(),
      investInStartupStages: z.array(z.string()).optional(),
      investInFundTypes: z.array(z.string()).optional(),
    })
    .optional(),
});

export const UpdateMemberSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  imageUid: z.string().optional().nullable(),
  memberState: z.nativeEnum(MemberState).optional(),
  joinDate: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
  aboutYou: z.string().optional().nullable(),

  country: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  city: z.string().optional().nullable(),

  skills: z.array(z.string()).optional(),

  teamOrProjectURL: z.string().url().optional().nullable(),

  teamMemberRoles: z
    .array(
      z.object({
        teamUid: z.string(),
        role: z.string(),
      })
    )
    .optional(),

  githubHandler: z.string().optional().nullable(),
  discordHandler: z.string().optional().nullable(),
  twitterHandler: z.string().optional().nullable(),
  linkedinHandler: z.string().optional().nullable(),
  telegramHandler: z.string().optional().nullable(),
  officeHours: z.string().optional().nullable(),
  ohInterest: z.array(z.string()).optional(),
  ohHelpWith: z.array(z.string()).optional(),

  investorProfile: z
    .object({
      secRulesAccepted: z.boolean().optional(),
      investmentFocus: z.array(z.string()),
      typicalCheckSize: z.number().nullable(),
      type: z.string().optional().nullable(),
      investInStartupStages: z.array(z.string()).optional(),
      investInFundTypes: z.array(z.string()).optional(),
    })
    .optional(),
});

export type MemberStateCounts = Record<MemberState, number>;

export class RequestMembersDto extends createZodDto(RequestMembersSchema) {}
export class CreateMemberDto extends createZodDto(CreateMemberSchema) {}
export class UpdateMemberDto extends createZodDto(UpdateMemberSchema) {}
