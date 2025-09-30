import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';

export const NotificationSettingsResponseSchema = z.object({
  memberUid: z.string(),
  recommendationsEnabled: z.boolean(),
  subscribed: z.boolean(),
  exampleSent: z.boolean(),
  exampleAttempts: z.number(),
  lastExampleSentAt: z.date().nullable(),
  showInvitationDialog: z.boolean(),
  emailFrequency: z.number(),
  byFocusArea: z.boolean(),
  byRole: z.boolean(),
  byFundingStage: z.boolean(),
  byIndustryTag: z.boolean(),
  focusAreaList: z.array(z.string()),
  roleList: z.array(z.string()),
  fundingStageList: z.array(z.string()),
  industryTagList: z.array(z.string()),
});

export const UpdateNotificationSettingsSchema = z.object({
  subscribed: z.boolean().optional(),
  showInvitationDialog: z.boolean().optional(),
  emailFrequency: z.number().int().min(1).optional(),
  byFocusArea: z.boolean().optional(),
  byRole: z.boolean().optional(),
  byFundingStage: z.boolean().optional(),
  byIndustryTag: z.boolean().optional(),
  byTechnology: z.boolean().optional(),
  byKeyword: z.boolean().optional(),
  focusAreaList: z.array(z.string()).optional(),
  roleList: z.array(z.string()).optional(),
  fundingStageList: z.array(z.string()).optional(),
  industryTagList: z.array(z.string()).optional(),
  technologyList: z.array(z.string()).optional(),
  keywordList: z.array(z.string()).optional(),
});

export const UpdateParticipationSchema = z.object({
  recommendationsEnabled: z.boolean(),
});

export const UpdateForumSettingsSchema = z.object({
  forumDigestEnabled: z.boolean(),
  forumDigestFrequency: z.number(),
});

export const CreateNotificationSettingItemSchema = z.object({
  contextId: z.string(),
  settings: z.any(),
  memberExternalId: z.string().optional(),
});

export const UpdateInvestorSettingsSchema = z.object({
  investorInvitesEnabled: z.boolean(),
  investorDealflowEnabled: z.boolean(),
});

export class UpdateInvestorSettingsDto extends createZodDto(UpdateInvestorSettingsSchema) {}

export const InvestorSettingsResponseSchema = z.object({
  memberUid: z.string(),
  investorInvitesEnabled: z.boolean(),
  investorDealflowEnabled: z.boolean(),
});


export class NotificationSettingsResponse extends createZodDto(NotificationSettingsResponseSchema) {}
export class UpdateNotificationSettingsDto extends createZodDto(UpdateNotificationSettingsSchema) {}
export class UpdateParticipationDto extends createZodDto(UpdateParticipationSchema) {}
export class UpdateForumSettingsDto extends createZodDto(UpdateForumSettingsSchema) {}
export class CreateNotificationSettingItemDto extends createZodDto(CreateNotificationSettingItemSchema) {}
export class InvestorSettingsResponse extends createZodDto(InvestorSettingsResponseSchema) {}
