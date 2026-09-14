import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';

export const MemberCvImportStatusSchema = z.enum(['PROCESSING', 'SUCCEEDED', 'NOTHING_FOUND', 'FAILED']);

export const YEAR_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? '');

const optionalYearMonth = z
  .string()
  .nullish()
  .transform((value) => value ?? '')
  .refine((value) => value === '' || YEAR_MONTH_REGEX.test(value), 'must be YYYY-MM');

const optionalStringList = z
  .array(z.string().nullish())
  .nullish()
  .transform((values) => (values ?? []).flatMap((value) => (value?.trim() ? [value.trim()] : [])));

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

/**
 * The stored document itself, as the profile's resting "Your CV" card renders
 * it: a short-lived link to the bytes, plus what the card prints beside them.
 *
 * `size` is read from S3 at serve time rather than stored on the row. The
 * column does not exist, and adding one would leave every CV uploaded before
 * the migration without a size — a gap the card would have to render around
 * forever. `HeadObject` has no such gap and is one call on a route that is
 * already fetching.
 *
 * Optional because that call is allowed to fail without taking the preview with
 * it: a card that cannot say "182 KB" is a smaller loss than a card that cannot
 * show the document.
 */
export const MemberCvImportFileSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
  originalFilename: z.string(),
  uploadedAt: z.string(),
  size: z.number().int().optional(),
});

export const ApplyCvExperienceSchema = z.object({
  title: optionalText,
  company: optionalText,
  description: optionalText,
  startDate: optionalYearMonth,
  endDate: optionalYearMonth,
  isCurrent: z
    .boolean()
    .nullish()
    .transform((value) => value ?? false),
  location: optionalText,
});

export const ApplyMemberCvImportSchema = z.object({
  importUid: z.string().min(1),
  role: optionalText,
  location: optionalText,
  skills: optionalStringList,
  experiences: z
    .array(ApplyCvExperienceSchema)
    .nullish()
    .transform((value) => value ?? []),
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
