import { z } from 'zod';

export const statusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export const participantTypeEnum = z.enum(['MEMBER', 'TEAM']);
const oldDataPostSchema = z.object({});
const teamMappingSchema = z.object({
  role: z.string(),
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
const newDataMemberSchema = z.object({
  name: z.string(),
  email: z.string(),
  plnStartDate: z.string(),
  teamAndRoles: z.array(teamMappingSchema).nonempty(),
  skills: z.array(skillsMappingSchema).nonempty(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  githubHandler: z.string().optional().nullable(),
  discordHandler: z.string().optional().nullable(),
  twitterHandler: z.string().optional().nullable(),
  linkedinHandler: z.string().optional().nullable(),
  officeHours: z.string().optional().nullable(),
  imageUid: z.string().optional().nullable(),
  moreDetails: z.string().optional().nullable(),
});

const newDataTeamSchema = z.object({
  name: z.string(),
  contactMethod: z.string(),
  industryTags: z.array(industrTagsMappingSchema).nonempty(),
  membershipSources: z.array(membershipSourcesMappingSchema).nonempty(),
  fundingStageUid: z.string(),
  technologies: z.array(TechnologiesMappingSchema).nonempty(),
  website: z.string().optional().nullable(),
  blog: z.string().optional().nullable(),
  shortDescription: z.string().optional().nullable(),
  longDescription: z.string().optional().nullable(),
  twitterHandler: z.string().optional().nullable(),
  linkedinHandler: z.string().optional().nullable(),
  officeHours: z.string().optional().nullable(),
  logoUid: z.string().optional().nullable(),
  moreDetails: z.string().optional().nullable(),
});

export const ParticipantRequestMemberSchema = z.object({
  participantType: participantTypeEnum,
  oldData: oldDataPostSchema.optional().nullable(),
  newData: newDataMemberSchema,
  referenceUid: z.string().optional().nullable(),
  requesterEmailId: z.string(),
  uniqueIdentifier: z.string(),
});

export const ParticipantRequestTeamSchema = z.object({
  participantType: participantTypeEnum,
  oldData: oldDataPostSchema.optional().nullable(),
  newData: newDataTeamSchema,
  referenceUid: z.string().optional().nullable(),
  requesterEmailId: z.string(),
  uniqueIdentifier: z.string(),
});
