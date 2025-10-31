import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { ResponseImageWithRelationsSchema, ResponseImageSchema } from './image';
import { LocationResponseSchema } from './location';
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';
import { ResponseSkillSchema } from './skill';
import { ResponseTeamMemberRoleSchema } from './team-member-role';
import { ProjectContributionSchema, ResponseProjectContributionSchema } from './project-contribution';
import { ResponseMemberExperienceSchema } from './member-experience';

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
  ohStatus: z.string().nullish(),
  scheduleMeetingCount: z.number().nullish(),
  ohInterest: z.array(z.string()).default([]),
  ohHelpWith: z.array(z.string()).default([]),
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
  accessLevel: z.string().nullish(),
});

export const ResponseMemberSchema = MemberSchema.omit({ id: true, telegramUid: true }).strict();

export const ResponseMemberWithRelationsSchema = ResponseMemberSchema.extend({
  image: ResponseImageWithRelationsSchema.optional(),
  location: LocationResponseSchema.optional(),
  skills: ResponseSkillSchema.array().optional(),
  teamMemberRoles: ResponseTeamMemberRoleSchema.array().optional(),
  projectContributions: ResponseProjectContributionSchema.array().optional(),
  experiences: ResponseMemberExperienceSchema.array().optional(),
});

export const SimpleMemberSchema = ResponseMemberSchema.pick({
  uid: true,
  name: true,
  email: true,
  accessLevel: true,
});

export const MembersByIdsRequestSchema = z.object({
  memberIds: z.array(z.string()).min(1, 'At least one member ID is required'),
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
  experiences: true,
});

export const MemberRelationalFields = ResponseMemberWithRelationsSchema.pick({
  image: true,
  location: true,
  skills: true,
  teamMemberRoles: true,
  projectContributions: true,
  experiences: true,
  linkedInProfile: true,
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

const ChangeEmailRequestSchema = z.object({
  newEmail: z.string().email(),
});

const SendEmailOtpRequestSchema = z.object({
  newEmail: z.string().email(),
});

export class SendEmailOtpRequestDto extends createZodDto(SendEmailOtpRequestSchema) {}
export class ChangeEmailRequestDto extends createZodDto(ChangeEmailRequestSchema) {}

// New filtering schemas
export const MemberFilterQueryParams = z.object({
  hasOfficeHours: z.boolean().optional(),
  topics: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  search: z.string().optional(),
  sort: z.enum(['name:asc', 'name:desc']).optional(),
  page: z.number().positive().optional(),
  limit: z.number().positive().max(100).optional(),
  // Investor-related filters
  isInvestor: z.boolean().optional(),
  minTypicalCheckSize: z.number().min(0).optional(),
  maxTypicalCheckSize: z.number().min(0).optional(),
  investmentFocus: z.array(z.string()).optional(),
});

export const AutocompleteQueryParams = z.object({
  q: z.string().optional(),
  page: z.number().positive().optional(),
  limit: z.number().positive().max(50).optional(),
  hasOfficeHours: z.boolean().optional(),
});

export const TopicAutocompleteResult = z.object({
  topic: z.string(),
  count: z.number(),
});

export const RoleAutocompleteResult = z.object({
  role: z.string(),
  count: z.number(),
});

export const AutocompleteResponse = z.object({
  results: z.array(z.union([TopicAutocompleteResult, RoleAutocompleteResult])),
  total: z.number(),
  page: z.number(),
  hasMore: z.boolean(),
});

export class MemberFilterQueryParamsDto extends createZodDto(MemberFilterQueryParams) {}
export class AutocompleteQueryParamsDto extends createZodDto(AutocompleteQueryParams) {}
export class AutocompleteResponseDto extends createZodDto(AutocompleteResponse) {}

// Forum service schema
export const MembersForNodebbRequestSchema = z.object({
  memberIds: z.array(z.string()).optional(),
  externalIds: z.array(z.string()).optional(),
});

export const MembersForNodebbSchema = ResponseMemberSchema.pick({
  uid: true,
  name: true,
  externalId: true,
  email: true,
  accessLevel: true,
  officeHours: true,
  ohStatus: true,
}).extend({
  image: ResponseImageSchema.pick({
    uid: true,
    url: true,
    filename: true,
  }).optional(),
  memberRoles: z
    .array(
      z.object({
        name: z.string(),
      })
    )
    .optional(),
  teamMemberRoles: z
    .array(
      z.object({
        role: z.string(),
        mainTeam: z.boolean(),
        teamLead: z.boolean(),
        team: z.object({
          name: z.string(),
          logo: ResponseImageSchema.pick({
            uid: true,
            url: true,
            filename: true,
          }).optional(),
        }),
      })
    )
    .optional(),
});

export class MembersForNodebbRequestDto extends createZodDto(MembersForNodebbRequestSchema) {}

// Access level change schema
export const UpdateMemberAccessLevelRequestSchema = z.object({
  accessLevel: z.enum(['L4', 'L6']),
});

export class UpdateMemberAccessLevelRequestDto extends createZodDto(UpdateMemberAccessLevelRequestSchema) {}
