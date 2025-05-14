import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { ResponseImageWithRelationsSchema } from './image';
import { LocationResponseSchema } from './location';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';
import { ResponseSkillSchema } from './skill';
import { ResponseTeamMemberRoleSchema } from './team-member-role';
import { ProjectContributionSchema, ResponseProjectContributionSchema } from './project-contribution';

export const GitHubRepositorySchema = z.object({
  name: z.string(),
  description: z.string(),
  url: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PreferenceSchema = z.object({
  showEmail: z.boolean(),
  showGithubHandle: z.boolean(),
  showTelegram: z.boolean(),
  showLinkedin: z.boolean(),
  showDiscord: z.boolean(),
  showGithubProjects: z.boolean(),
  showTwitter: z.boolean(),
  showSubscription: z.boolean(),
});

export const MemberSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
  email: z.string(),
  externalId: z.string().nullish(),
  imageUid: z.string().nullish(),
  githubHandler: z.string().nullish(),
  discordHandler: z.string().nullish(),
  twitterHandler: z.string().nullish(),
  telegramHandler: z.string().nullish(),
  telegramUid: z.string().nullable(),
  officeHours: z.string().nullish(),
  airtableRecId: z.string().nullish(),
  plnFriend: z.boolean().nullish(),
  bio: z.string().nullish(),
  signUpSource: z.string().nullish(),
  signUpMedium: z.string().nullish(),
  signUpCampaign: z.string().nullish(),
  isFeatured: z.boolean().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
  locationUid: z.string().nullable(),
  openToWork: z.boolean().nullish(),
  linkedinHandler: z.string().nullish(),
  repositories: GitHubRepositorySchema.array().optional(),
  preferences: PreferenceSchema.optional(),
  projectContributions: z.array(ProjectContributionSchema).optional(),
  isVerified: z.boolean().nullish(),
  isUserConsent: z.boolean().nullish(),
  isSubscribedToNewsletter: z.boolean().nullish(),
  teamOrProjectURL: z.string().nullish(),
});

export const ResponseMemberSchema = MemberSchema.omit({ id: true, telegramUid: true }).strict();

export const ResponseMemberWithRelationsSchema = ResponseMemberSchema.extend({
  image: ResponseImageWithRelationsSchema.optional(),
  location: LocationResponseSchema.optional(),
  skills: ResponseSkillSchema.array().optional(),
  teamMemberRoles: ResponseTeamMemberRoleSchema.array().optional(),
  projectContributions: ResponseProjectContributionSchema.array().optional(),
});

export const CreateMemberSchema = MemberSchema.pick({
  name: true,
  email: true,
  imageUid: true,
  githubHandler: true,
  discordHandler: true,
  twitterHandler: true,
  officeHours: true,
  plnFriend: true,
  locationUid: true,
  bio: true,
  signUpSource: true,
  isFeatured: true,
  openToWork: true,
  linkedinHandler: true,
  telegramHandler: true,
  isVerified: true,
  isUserConsent: true,
  isSubscribedToNewsletter: true,
  teamOrProjectURL: true,
  preferences: true,
  projectContributions: true,
});

export const MemberRelationalFields = ResponseMemberWithRelationsSchema.pick({
  image: true,
  location: true,
  skills: true,
  teamMemberRoles: true,
  projectContributions: true,
}).strip();

export const MemberQueryableFields = ResponseMemberSchema.keyof();

export const MemberQueryParams = QueryParams({
  queryableFields: MemberQueryableFields,
  relationalFields: MemberRelationalFields,
});

export const MemberDetailQueryParams = MemberQueryParams.unwrap().pick(RETRIEVAL_QUERY_FILTERS).optional();

export class MemberDto extends createZodDto(MemberSchema.omit({ telegramUid: true })) {}
export class InternalUpdateMemberDto extends createZodDto(
  MemberSchema.pick({ telegramUid: true, telegramHandler: true })
) {}

export class CreateMemberSchemaDto extends createZodDto(CreateMemberSchema) {}

export class ResponseMemberSchemaDto extends createZodDto(ResponseMemberSchema) {}

export type TMemberResponse = z.infer<typeof ResponseMemberWithRelationsSchema>;

export const ChangeEmailRequestSchema = z.object({
  newEmail: z.string().email(),
});

export const SendEmailOtpRequestSchema = z.object({
  newEmail: z.string().email(),
});

export class SendEmailOtpRequestDto extends createZodDto(SendEmailOtpRequestSchema) {}
export class ChangeEmailRequestDto extends createZodDto(ChangeEmailRequestSchema) {}
