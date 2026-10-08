import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

const emailField = z.string().trim().email();

export const SpvAccessRequestSchema = z.object({
  email: emailField.refine((value) => {
    const domain = value.split('@')[1] ?? '';
    return domain.includes('.');
  }, 'Email domain must contain a dot'),
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  organization: z.string().trim().min(1),
  isAccreditedInvestor: z.literal(true),
});

export class SpvAccessRequestDto extends createZodDto(SpvAccessRequestSchema) {}

const templateSchema = z.object({
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

export const SpvEmailTemplatesSchema = z.object({
  invitePreapproved: templateSchema,
  followUpPreapproved: templateSchema,
  inviteOutreach: templateSchema,
  followUpOutreach: templateSchema,
  approved: templateSchema,
  opened: templateSchema,
});

const mediaItemSchema = z.object({
  imageUid: z.string().min(1),
  alt: z.string().trim().min(1),
  fit: z.enum(['cover', 'contain']).optional(),
});

export const CreateSpvSpotlightSchema = z.object({
  teamUid: z.string().min(1),
  title: z.string().trim().min(1),
  description: z.string().min(1),
  slug: z.string().trim().min(1).optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
  supportEmail: z.string().email().optional().nullable(),
  senderEmail: z.string().email().optional().nullable(),
  senderName: z.string().max(120).optional().nullable(),
  replyToEmail: z.string().email().optional().nullable(),
  docSendUrl: z.string().url().optional().nullable(),
  summary: z.string().optional().nullable(),
  closesAt: z.string().datetime().optional().nullable(),
  media: z.array(mediaItemSchema).optional(),
});

export class CreateSpvSpotlightDto extends createZodDto(CreateSpvSpotlightSchema) {}

export const UpdateSpvSpotlightSchema = CreateSpvSpotlightSchema.partial().omit({ teamUid: true });

export class UpdateSpvSpotlightDto extends createZodDto(UpdateSpvSpotlightSchema) {}

export const GetSpvSpotlightsQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
});

export class GetSpvSpotlightsQueryDto extends createZodDto(GetSpvSpotlightsQuerySchema) {}

export const UpdateSpvEmailTemplatesSchema = z.object({
  templates: SpvEmailTemplatesSchema.partial(),
});

export class UpdateSpvEmailTemplatesDto extends createZodDto(UpdateSpvEmailTemplatesSchema) {}

const bulkParticipantSchema = z.object({
  email: emailField,
  name: z.string().optional(),
  emailTemplateVariables: z.record(z.string(), z.string()).optional(),
});

export const AddSpvParticipantsBulkSchema = z.object({
  cohort: z.enum(['PRE_APPROVED', 'OUTREACH']),
  participants: z.array(bulkParticipantSchema).min(1).max(500),
});

export class AddSpvParticipantsBulkDto extends createZodDto(AddSpvParticipantsBulkSchema) {}

export const AddSpvParticipantSchema = z
  .object({
    memberUid: z.string().min(1).optional(),
    email: emailField.optional(),
    name: z.string().trim().min(1).optional(),
    type: z.enum(['INVESTOR', 'FOUNDER']),
    cohort: z.enum(['PRE_APPROVED', 'OUTREACH']).optional(),
  })
  .refine((data) => data.memberUid || data.email, {
    message: 'Either memberUid or email must be provided',
  });

export class AddSpvParticipantDto extends createZodDto(AddSpvParticipantSchema) {}

export const UpdateSpvParticipantSchema = z.object({
  type: z.enum(['INVESTOR', 'FOUNDER', 'SUPPORT']).optional(),
  access: z.enum(['VIEW', 'VIEW_ADMIN', 'EDIT', 'RESTRICTED']).optional(),
  cohort: z.enum(['PRE_APPROVED', 'OUTREACH']).nullable().optional(),
  emailTemplateVariables: z.record(z.string(), z.string()).nullable().optional(),
});

export class UpdateSpvParticipantDto extends createZodDto(UpdateSpvParticipantSchema) {}

export const SendSpvBulkSchema = z.object({
  includeAlreadyInvited: z.boolean().optional().default(false),
  includeAlreadyFollowedUp: z.boolean().optional().default(false),
  participantUids: z.array(z.string().min(1)).min(1).optional(),
});

export class SendSpvBulkDto extends createZodDto(SendSpvBulkSchema) {}

export const SendSpvOpenNoticeSchema = z.object({
  includeAlreadySent: z.boolean().optional().default(false),
  participantUids: z.array(z.string().min(1)).min(1).optional(),
});

export class SendSpvOpenNoticeDto extends createZodDto(SendSpvOpenNoticeSchema) {}

export const RemoveSpvParticipantsBulkSchema = z.object({
  participantUids: z.array(z.string().min(1)).min(1),
});

export class RemoveSpvParticipantsBulkDto extends createZodDto(RemoveSpvParticipantsBulkSchema) {}

export const GetSpvParticipantsQuerySchema = z.object({
  type: z.enum(['INVESTOR', 'FOUNDER', 'SUPPORT']).optional(),
});

export class GetSpvParticipantsQueryDto extends createZodDto(GetSpvParticipantsQuerySchema) {}
