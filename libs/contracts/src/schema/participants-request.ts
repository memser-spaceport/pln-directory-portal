import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';
import { ProjectContributionSchema } from './project-contribution';

export const statusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export const participantTypeEnum = z.enum(['MEMBER', 'TEAM']);
const oldDataPostSchema = z.object({});
const teamMappingSchema = z.object({
  role: z.string().optional(),
  teamUid: z.string(),
  teamTitle: z.string(),
});

const skillsMappingSchema = z.object({
  uid: z.string(),
  title: z.string(),
});
const TechnologiesMappingSchema = z.object({
  uid: z.string(),
  title: z.string(),
});
const membershipSourcesMappingSchema = z.object({
  uid: z.string(),
  title: z.string(),
});
const industrTagsMappingSchema = z.object({
  uid: z.string(),
  title: z.string(),
});
const fundingStageMappingSchema = z.object({
  uid: z.string(),
  title: z.string(),
});
const newDataMemberSchema = z.object({
  name: z.string(),
  email: z.string(),
  plnStartDate: z.string().optional().nullable(),
  teamAndRoles: z.array(teamMappingSchema).optional(),
  skills: z.array(skillsMappingSchema).optional(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  githubHandler: z.string().optional().nullable(),
  discordHandler: z.string().optional().nullable(),
  twitterHandler: z.string().optional().nullable(),
  linkedinHandler: z.string().optional().nullable(),
  telegramHandler: z.string().optional().nullable(),
  officeHours: z.string().optional().nullable(),
  imageUid: z.string().optional().nullish(),
  moreDetails: z.string().optional().nullish(),
  projectContributions: z.array(ProjectContributionSchema as any).optional(),
  bio: z.string().nullish(),
  signUpSource: z.string().nullish(),
  isFeatured: z.boolean().nullish(),
  locationUid: z.string().nullish(),
  openToWork: z.boolean().nullish(),
  isVerified: z.boolean().nullish(),
  isUserConsent: z.boolean().nullish(),
  isSubscribedToNewsletter: z.boolean().nullish(),
  teamOrProjectURL: z.string().nullish()
});

const newDataTeamSchema = z.object({
  name: z.string(),
  contactMethod: z.string(),
  industryTags: z.array(industrTagsMappingSchema).nonempty(),
  fundingStage: fundingStageMappingSchema,
  technologies: z.array(TechnologiesMappingSchema),
  membershipSources: z
    .array(membershipSourcesMappingSchema)
    .optional()
    .nullable(),
  website: z.string().optional().nullable(),
  blog: z.string().optional().nullable(),
  shortDescription: z.string().optional().nullable(),
  longDescription: z.string().optional().nullable(),
  twitterHandler: z.string().optional().nullable(),
  linkedinHandler: z.string().optional().nullable(),
  telegramHandler: z.string().optional().nullable(),
  officeHours: z.string().optional().nullable(),
  logoUid: z.string().optional().nullable(),
  moreDetails: z.string().optional().nullable(),
});

export const ParticipantRequestMemberSchema = z.object({
  participantType: participantTypeEnum,
  oldData: oldDataPostSchema.optional().nullable(),
  newData: newDataMemberSchema,
  referenceUid: z.string().optional().nullable(),
  requesterEmailId: z.string().nullish(),
  uniqueIdentifier: z.string(),
});

export const ParticipantProcessRequestSchema = z.object({
  participantType: participantTypeEnum,
  status: statusEnum,
  referenceUid: z.string().optional().nullable(),
});

export const ParticipantRequestTeamSchema = z.object({
  participantType: participantTypeEnum,
  oldData: oldDataPostSchema.optional().nullable(),
  newData: newDataTeamSchema,
  referenceUid: z.string().optional().nullable(),
  requesterEmailId: z.string().nullish(),
  uniqueIdentifier: z.string(),
});

export const FindUniqueIdentiferSchema = z.object({
  type: participantTypeEnum,
  identifier: z.string()
})

const ProcessParticipantRequest = z.object({
  status: statusEnum,
  isVerified: z.boolean()
})
const ProcessBulkRequest = z.object({
  uid: z.string(),
  status: statusEnum,
  participantType: participantTypeEnum,
  isVerified: z.boolean()
})
export class ProcessBulkParticipantRequest extends createZodDto(ProcessBulkRequest) { }
export class ProcessParticipantReqDto extends createZodDto(ProcessParticipantRequest) { }
export class FindUniqueIdentiferDto extends createZodDto(FindUniqueIdentiferSchema) { }
