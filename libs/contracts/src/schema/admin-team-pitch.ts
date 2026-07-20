import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { AddParticipantsBulkSchema, ResponseBulkParticipantsSchema } from './admin-demo-day';

export const CreateTeamPitchSchema = z.object({
  teamUid: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  slug: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
  supportEmail: z.string().email().optional().nullable(),
  headerImageUid: z.string().optional().nullable(),
  logoUid: z.string().optional().nullable(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .nullable(),
});

export class CreateTeamPitchDto extends createZodDto(CreateTeamPitchSchema) {}

export const UpdateTeamPitchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  spotlightFrequency: z.string().min(1).optional(),
  spotlightStatement: z.string().optional().nullable(),
  slug: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
  supportEmail: z.string().email().optional().nullable(),
  headerImageUid: z.string().optional().nullable(),
  logoUid: z.string().optional().nullable(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .nullable(),
  analyticsReportUrl: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
});

export class UpdateTeamPitchDto extends createZodDto(UpdateTeamPitchSchema) {}

export const AddTeamPitchParticipantSchema = z
  .object({
    memberUid: z.string().optional(),
    email: z.string().email().optional(),
    name: z.string().optional(),
    type: z.enum(['INVESTOR', 'FOUNDER', 'SUPPORT']),
  })
  .refine((data) => data.memberUid || data.email, {
    message: 'Either memberUid or email must be provided',
  });

export class AddTeamPitchParticipantDto extends createZodDto(AddTeamPitchParticipantSchema) {}

export const UpdateTeamPitchParticipantSchema = z.object({
  type: z.enum(['INVESTOR', 'FOUNDER', 'SUPPORT']).optional(),
  access: z.enum(['VIEW', 'VIEW_ADMIN', 'EDIT', 'RESTRICTED']).optional(),
});

export class UpdateTeamPitchParticipantDto extends createZodDto(UpdateTeamPitchParticipantSchema) {}

export const GetTeamPitchesQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
});

export class GetTeamPitchesQueryDto extends createZodDto(GetTeamPitchesQuerySchema) {}

export const GetTeamPitchParticipantsQuerySchema = z.object({
  type: z.enum(['INVESTOR', 'FOUNDER', 'SUPPORT']).optional(),
});

export class GetTeamPitchParticipantsQueryDto extends createZodDto(GetTeamPitchParticipantsQuerySchema) {}

export const AddTeamPitchParticipantsBulkSchema = z.object({
  participants: AddParticipantsBulkSchema.shape.participants.max(50),
});

export class AddTeamPitchParticipantsBulkDto extends createZodDto(AddTeamPitchParticipantsBulkSchema) {}

export { ResponseBulkParticipantsSchema as ResponseTeamPitchParticipantsBulkSchema };
export class ResponseTeamPitchParticipantsBulkDto extends createZodDto(ResponseBulkParticipantsSchema) {}

export const SendTeamPitchInvitesBulkSchema = z.object({
  /** When false (default), only investors who have never been invited are emailed. */
  includeAlreadyInvited: z.boolean().optional().default(false),
  /** When provided, only these participant UIDs are considered. */
  participantUids: z.array(z.string().min(1)).min(1).optional(),
});

export class SendTeamPitchInvitesBulkDto extends createZodDto(SendTeamPitchInvitesBulkSchema) {}

export const ResponseTeamPitchInvitesBulkSchema = z.object({
  summary: z.object({
    totalEligible: z.number(),
    sent: z.number(),
    skipped: z.number(),
    errors: z.number(),
  }),
  rows: z.array(
    z.object({
      participantUid: z.string(),
      email: z.string().nullable(),
      name: z.string().nullable(),
      status: z.enum(['sent', 'skipped', 'error']),
      message: z.string().optional().nullable(),
    })
  ),
});

export class ResponseTeamPitchInvitesBulkDto extends createZodDto(ResponseTeamPitchInvitesBulkSchema) {}

export const SendTeamPitchFollowUpsBulkSchema = z.object({
  /** When false (default), only investors who have never received a follow-up are emailed. */
  includeAlreadyFollowedUp: z.boolean().optional().default(false),
  /** When provided, only these participant UIDs are considered. */
  participantUids: z.array(z.string().min(1)).min(1).optional(),
});

export class SendTeamPitchFollowUpsBulkDto extends createZodDto(SendTeamPitchFollowUpsBulkSchema) {}

export const ResponseTeamPitchFollowUpsBulkSchema = ResponseTeamPitchInvitesBulkSchema;
export class ResponseTeamPitchFollowUpsBulkDto extends createZodDto(ResponseTeamPitchFollowUpsBulkSchema) {}

export const RemoveTeamPitchParticipantsBulkSchema = z.object({
  participantUids: z.array(z.string().min(1)).min(1).max(200),
});

export class RemoveTeamPitchParticipantsBulkDto extends createZodDto(RemoveTeamPitchParticipantsBulkSchema) {}

export const ResponseTeamPitchParticipantsRemoveBulkSchema = z.object({
  summary: z.object({
    total: z.number(),
    removed: z.number(),
    skipped: z.number(),
  }),
  rows: z.array(
    z.object({
      participantUid: z.string(),
      status: z.enum(['removed', 'skipped']),
      message: z.string().optional().nullable(),
    })
  ),
});

export class ResponseTeamPitchParticipantsRemoveBulkDto extends createZodDto(
  ResponseTeamPitchParticipantsRemoveBulkSchema
) {}
