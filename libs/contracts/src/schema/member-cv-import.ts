import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';

export const MemberCvImportStatusSchema = z.enum(['PROCESSING', 'SUCCEEDED', 'NOTHING_FOUND', 'FAILED']);

export const YEAR_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const ParsedCvExperienceSchema = z.object({
  key: z.string(),
  title: z.string(),
  company: z.string(),
  description: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  isCurrent: z.boolean(),
  location: z.string(),
});

export const ParsedCvProfileSchema = z.object({
  role: z.string(),
  location: z.string(),
  skills: z.array(z.string()),
  experiences: z.array(ParsedCvExperienceSchema),
});

export const MemberCvImportErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const MemberCvImportAcceptedSchema = z.object({
  uid: z.string(),
  status: z.literal('PROCESSING'),
});

export const MemberCvImportLatestSchema = z.object({
  uid: z.string(),
  status: MemberCvImportStatusSchema,
  originalFilename: z.string(),
  payload: ParsedCvProfileSchema.optional(),
  error: MemberCvImportErrorSchema.optional(),
});

export const ApplyCvExperienceSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  description: z.string(),
  startDate: z.string().regex(YEAR_MONTH_REGEX, 'startDate must be YYYY-MM'),
  endDate: z.string().regex(YEAR_MONTH_REGEX, 'endDate must be YYYY-MM').nullable(),
  isCurrent: z.boolean(),
  location: z.string(),
});

export const ApplyMemberCvImportSchema = z.object({
  importUid: z.string().min(1),
  role: z.string(),
  location: z.string(),
  skills: z.array(z.string()),
  experiences: z.array(ApplyCvExperienceSchema),
});

export const ApplyMemberCvImportResponseSchema = z.object({
  uid: z.string(),
  role: z.string().nullable(),
  locationApplied: z.boolean(),
  skillsAdded: z.array(z.string()),
  experiencesAdded: z.number().int(),
});

export class ApplyMemberCvImportDto extends createZodDto(ApplyMemberCvImportSchema) {}

export type ParsedCvExperience = z.infer<typeof ParsedCvExperienceSchema>;
export type ParsedCvProfile = z.infer<typeof ParsedCvProfileSchema>;
export type ApplyMemberCvImport = z.infer<typeof ApplyMemberCvImportSchema>;
