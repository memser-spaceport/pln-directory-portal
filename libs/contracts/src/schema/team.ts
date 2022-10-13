import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const TeamSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
  logo: z.string().nullish(),
  blog: z.string().nullish(),
  website: z.string().nullish(),
  twitterHandler: z.string().nullish(),
  shortDescripton: z.string().nullish(),
  longDescripton: z.string().nullish(),
  filecoinUser: z.boolean(),
  ipfsUser: z.boolean(),
  plnFriend: z.boolean(),
  startDate: z.date().or(z.string()).nullish(),
  endDate: z.date().or(z.string()).nullish(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
  fundingStageUid: z.string().nullish(),
});

export const CreateTeamSchema = TeamSchema.pick({
  name: true,
  logo: true,
  blog: true,
  website: true,
  twitterHandler: true,
  shortDescripton: true,
  longDescripton: true,
  filecoinUser: true,
  ipfsUser: true,
  plnFriend: true,
  fundingStageUid: true,
});

export const GetTeamSchema = TeamSchema.pick({
  uid: true,
  name: true,
  logo: true,
  blog: true,
  website: true,
  twitterHandler: true,
  shortDescripton: true,
  longDescripton: true,
  filecoinUser: true,
  ipfsUser: true,
  plnFriend: true,
  fundingStageUid: true,
});

export class TeamDto extends createZodDto(TeamSchema) {}

export class CreateTeamSchemaDto extends createZodDto(CreateTeamSchema) {}
