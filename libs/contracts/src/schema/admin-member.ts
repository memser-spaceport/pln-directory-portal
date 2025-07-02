import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export enum AccessLevel {
  L0 = 'L0',
  L1 = 'L1',
  L2 = 'L2',
  L3 = 'L3',
  L4 = 'L4',
  REJECTED = 'Rejected',
}

export const AccessLevelDescriptions: Record<AccessLevel, string> = {
  [AccessLevel.L0]:
    'Account created but KYC pending = former unverified = user can only access their profile, all other feature access similar to logged out view',
  [AccessLevel.L1]:
    'KYC complete = former unverified = user sees a message with verification success with prompt to fill out their profile & still no access to features. At this point system generates an email to admin and she approves/rejects the user',
  [AccessLevel.L2]:
    'Access Approved = former unverified = user gets a notification that they are approved/welcome to explore the product. They have access to all features at this point',
  [AccessLevel.L3]: 'Mission Aligned = former verified + friends of PL',
  [AccessLevel.L4]:
    'Portfolio Investment or Core Contributors = former verified + Member = All users La Christa adds via the Back Office "Add Member" flow go here',
  [AccessLevel.REJECTED]: 'User has been rejected by admin = former rejected',
};

export const RequestMembersSchema = z.object({
  accessLevel: z
    .string()
    .transform((val) => val.split(',').map((v) => v.trim()))
    .refine((arr) => arr.length > 0, { message: 'accessLevel must contain at least one value' }),
  page: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .optional()
    .default('1'),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .optional()
    .default('20'),
});

export const CreateMemberSchema = z.object({
  name: z.string(),
  accessLevel: z.string(),
  email: z.string().email(),
  imageUid: z.string(),
  joinDate: z.string(),
  bio: z.string(),

  country: z.string(),
  region: z.string(),
  city: z.string(),

  skills: z.array(z.string()),

  teamOrProjectURL: z.string().url(),

  teamMemberRoles: z.array(
    z.object({
      teamUid: z.string(),
      role: z.string(),
    })
  ),

  githubHandler: z.string().optional(),
  discordHandler: z.string().optional(),
  twitterHandler: z.string().optional(),
  linkedinHandler: z.string().optional(),
  telegramHandler: z.string().optional(),
  officeHours: z.string().optional(),
});

export const UpdateMemberSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  imageUid: z.string().optional(),
  accessLevel: z.string().optional(),
  joinDate: z.string().optional(),
  bio: z.string().optional(),

  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),

  skills: z.array(z.string()).optional(),

  teamOrProjectURL: z.string().url().optional(),

  teamMemberRoles: z.array(
    z.object({
      teamUid: z.string(),
      role: z.string(),
    })
  ).optional(),

  githubHandler: z.string().optional(),
  discordHandler: z.string().optional(),
  twitterHandler: z.string().optional(),
  linkedinHandler: z.string().optional(),
  telegramHandler: z.string().optional(),
  officeHours: z.string().optional(),
});

export const UpdateAccessLevelSchema = z.object({
  memberUids: z
    .string()
    .array()
    .nonempty({ message: 'memberUids cannot be empty' }),
  accessLevel: z
    .string()
    .min(1, { message: 'accessLevel must not be empty' }),
});

export type AccessLevelCounts = Record<AccessLevel, number>;

export class RequestMembersDto extends createZodDto(RequestMembersSchema) {}
export class CreateMemberDto extends createZodDto(CreateMemberSchema) {}
export class UpdateMemberDto extends createZodDto(UpdateMemberSchema) {}
export class UpdateAccessLevelDto extends createZodDto(UpdateAccessLevelSchema) {}
