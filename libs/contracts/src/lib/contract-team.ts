import { initContract } from '@ts-rest/core';
import { z } from 'zod';

export const TeamSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
  logo: z.string(),
  blog: z.string().nullish(),
  website: z.string().nullish(),
  twitterHandler: z.string().nullish(),
  shortDescripton: z.string().nullish(),
  longDescripton: z.string().nullish(),
  filecoinUser: z.boolean(),
  ipfsUser: z.boolean(),
  plnFriend: z.boolean(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  createdAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  fundingStageUid: z.string().nullish(),
});

const contract = initContract();

export const apiTeam = contract.router({
  createTeam: {
    method: 'POST',
    path: '/',
    responses: {
      201: TeamSchema,
    },
    body: z.object({
      name: z.string(),
      logo: z.string(),
      blog: z.string().nullish(),
      website: z.string().nullish(),
      twitterHandler: z.string().nullish(),
      shortDescripton: z.string().nullish(),
      longDescripton: z.string().nullish(),
      filecoinUser: z.boolean(),
      ipfsUser: z.boolean(),
      plnFriend: z.boolean(),
      startDate: z.boolean(),
      endDate: z.boolean(),
      fundingStageUid: z.string(),
    }),
    summary: 'Create a team',
  },
});
