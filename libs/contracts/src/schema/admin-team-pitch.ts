import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const CreateTeamPitchSchema = z.object({
  teamUid: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  slug: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
  supportEmail: z.string().email(),
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
  slug: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
  supportEmail: z.string().email().optional(),
  headerImageUid: z.string().optional().nullable(),
  logoUid: z.string().optional().nullable(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .nullable(),
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
  access: z.enum(['VIEW', 'EDIT', 'RESTRICTED']).optional(),
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
