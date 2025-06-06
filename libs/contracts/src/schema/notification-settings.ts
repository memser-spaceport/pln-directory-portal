import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';

export const NotificationSettingsResponseSchema = z.object({
  memberUid: z.string(),
  recommendationsEnabled: z.boolean(),
  subscribed: z.boolean(),
  showInvitationDialog: z.boolean(),
  emailFrequency: z.number(),
  byFocusArea: z.boolean(),
  byRole: z.boolean(),
  byFundingStage: z.boolean(),
});

export const UpdateNotificationSettingsSchema = z.object({
  subscribed: z.boolean().optional(),
  showInvitationDialog: z.boolean().optional(),
  emailFrequency: z.number().int().min(1).optional(),
  byFocusArea: z.boolean().optional(),
  byRole: z.boolean().optional(),
  byFundingStage: z.boolean().optional(),
});

export const UpdateParticipationSchema = z.object({
  recommendationsEnabled: z.boolean(),
});

export class NotificationSettingsResponse extends createZodDto(NotificationSettingsResponseSchema) {}
export class UpdateNotificationSettingsDto extends createZodDto(UpdateNotificationSettingsSchema) {}
export class UpdateParticipationDto extends createZodDto(UpdateParticipationSchema) {}
