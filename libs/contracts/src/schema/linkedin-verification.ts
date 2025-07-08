import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';

const LinkedInAuthUrlRequestSchema = z.object({
  memberUid: z.string(),
  redirectUrl: z.string().url().optional(),
});

const LinkedInCallbackRequestSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
});

const LinkedInVerificationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  linkedinProfileId: z.string().optional(),
  linkedinHandler: z.string().optional(),
  profileData: z.record(z.any()).optional(),
  redirectUrl: z.string(),
  newAccessLevel: z.string().nullable(),
});

const LinkedInProfileDataSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  profilePicture: z.string().optional(),
  email: z.string().email().optional(),
  positions: z
    .array(
      z.object({
        company: z.string(),
        title: z.string(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        summary: z.string().optional(),
      })
    )
    .optional(),
});

const LinkedInProfileSchema = z.object({
  uid: z.string(),
  memberUid: z.string(),
  linkedinProfileId: z.string(),
  linkedinHandler: z.string().nullable(),
  profileData: z.record(z.any()),
  isVerified: z.boolean(),
  verifiedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const LinkedInVerificationStatusSchema = z.object({
  verified: z.boolean(),
  linkedinHandler: z.string().optional(),
  linkedinProfile: LinkedInProfileSchema.optional(),
});

export class LinkedInAuthUrlRequestDto extends createZodDto(LinkedInAuthUrlRequestSchema) {}
export class LinkedInCallbackRequestDto extends createZodDto(LinkedInCallbackRequestSchema) {}
export class LinkedInVerificationResponseDto extends createZodDto(LinkedInVerificationResponseSchema) {}
export class LinkedInProfileDataDto extends createZodDto(LinkedInProfileDataSchema) {}
export class LinkedInProfileDto extends createZodDto(LinkedInProfileSchema) {}
export class LinkedInVerificationStatusDto extends createZodDto(LinkedInVerificationStatusSchema) {}
