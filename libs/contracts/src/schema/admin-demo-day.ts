import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

// Create Demo Day Schema
export const CreateDemoDaySchema = z.object({
  startDate: z.string(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  status: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED']),
});

export class CreateDemoDayDto extends createZodDto(CreateDemoDaySchema) {}

// Update Demo Day Schema
export const UpdateDemoDaySchema = z.object({
  startDate: z.string().optional(),
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().min(1, 'Description is required').optional(),
  status: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED']).optional(),
});

export class UpdateDemoDayDto extends createZodDto(UpdateDemoDaySchema) {}

// Add Single Participant Schema
export const AddParticipantSchema = z
  .object({
    memberUid: z.string().optional(),
    email: z.string().email().optional(),
    name: z.string().optional(),
    type: z.enum(['INVESTOR', 'FOUNDER']),
  })
  .refine((data) => data.memberUid || data.email, {
    message: 'Either memberUid or email must be provided',
  });

export class AddParticipantDto extends createZodDto(AddParticipantSchema) {}

// Add Bulk Participants Schema
export const AddParticipantsBulkSchema = z.object({
  participants: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().min(1, 'Name is required'),
        organization: z.string().optional().nullable(),
        organizationEmail: z.string().optional().nullable(),
        twitterHandler: z.string().optional().nullable(),
        linkedinHandler: z.string().optional().nullable(),
        telegramHandler: z.string().optional().nullable(),
        role: z.string().optional().nullable(),
        investmentType: z.enum(['ANGEL', 'FUND', 'ANGEL_AND_FUND']).optional().nullable(),
        typicalCheckSize: z.number().optional().nullable(),
        investInStartupStages: z.array(z.string()).optional().nullable(),
        secRulesAccepted: z.boolean().optional().nullable(),
        makeTeamLead: z.boolean().optional(),
      })
    )
    .min(1, 'At least one participant is required'),
});

export class AddParticipantsBulkDto extends createZodDto(AddParticipantsBulkSchema) {}

// Get Participants Query Schema
export const GetParticipantsQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default('20'),
  status: z.enum(['INVITED', 'ENABLED', 'DISABLED']).optional(),
  type: z.enum(['INVESTOR', 'FOUNDER']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'statusUpdatedAt', 'type', 'status']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export class GetParticipantsQueryDto extends createZodDto(GetParticipantsQuerySchema) {}

// Update Participant Schema
export const UpdateParticipantSchema = z.object({
  status: z.enum(['INVITED', 'ENABLED', 'DISABLED']).optional(),
  teamUid: z.string().optional(),
  type: z.enum(['INVESTOR', 'FOUNDER']).optional(),
});

export class UpdateParticipantDto extends createZodDto(UpdateParticipantSchema) {}

// Response DTOs
export const ResponseDemoDaySchema = z.object({
  id: z.number(),
  uid: z.string(),
  startDate: z.date(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED']),
  createdAt: z.date(),
  updatedAt: z.date(),
  isDeleted: z.boolean(),
  deletedAt: z.date().nullable(),
});

export class ResponseDemoDayDto extends createZodDto(ResponseDemoDaySchema) {}

export const ResponseParticipantSchema = z.object({
  id: z.number(),
  uid: z.string(),
  demoDayUid: z.string(),
  memberUid: z.string(),
  type: z.enum(['INVESTOR', 'FOUNDER']),
  status: z.enum(['INVITED', 'ENABLED', 'DISABLED']),
  teamUid: z.string().nullable(),
  statusUpdatedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  isDeleted: z.boolean(),
  deletedAt: z.date().nullable(),
});

export class ResponseParticipantDto extends createZodDto(ResponseParticipantSchema) {}

export const ResponseBulkParticipantsSchema = z.object({
  summary: z.object({
    total: z.number(),
    createdUsers: z.number(),
    updatedUsers: z.number(),
    createdTeams: z.number(),
    updatedMemberships: z.number(),
    promotedToLead: z.number(),
    errors: z.number(),
  }),
  rows: z.array(
    z.object({
      email: z.string(),
      name: z.string(),
      organization: z.string().optional().nullable(),
      organizationEmail: z.string().optional().nullable(),
      twitterHandler: z.string().optional().nullable(),
      linkedinHandler: z.string().optional().nullable(),
      telegramHandler: z.string().optional().nullable(),
      role: z.string().optional().nullable(),
      investmentType: z.enum(['ANGEL', 'FUND', 'ANGEL_AND_FUND']).optional().nullable(),
      typicalCheckSize: z.number().optional().nullable(),
      investInStartupStages: z.array(z.string()).optional().nullable(),
      secRulesAccepted: z.boolean().optional().nullable(),
      makeTeamLead: z.boolean().optional(),
      willBeTeamLead: z.boolean(),
      status: z.enum(['success', 'error']),
      message: z.string().optional().nullable(),
      userId: z.string().optional().nullable(),
      teamId: z.string().optional().nullable(),
      membershipRole: z.enum(['Lead', 'Contributor']).optional(),
    })
  ),
});

export class ResponseBulkParticipantsDto extends createZodDto(ResponseBulkParticipantsSchema) {}

export const ResponseParticipantsListSchema = z.object({
  participants: z.array(z.any()),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export class ResponseParticipantsListDto extends createZodDto(ResponseParticipantsListSchema) {}
