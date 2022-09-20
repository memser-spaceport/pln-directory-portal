import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const MemberSchema = z.object({
  createdAt: z.date().transform((d) => d.toISOString()),
  updatedAt: z.date().transform((d) => d.toISOString()),
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullish(),
  githubHandler: z.string().nullish(),
  discordHandler: z.string().nullish(),
  twitterHandler: z.string().nullish(),
  officeHours: z.string().nullish(),
  plnFriend: z.boolean(),
  locationUid: z.string(),
});

const contract = initContract();

export const apiMember = contract.router({
  createMember: {
    method: 'POST',
    path: '/',
    responses: {
      201: MemberSchema,
    },
    body: z.object({
      name: z.string(),
      email: z.string(),
      image: z.string().nullish(),
      githubHandler: z.string().nullish(),
      discordHandler: z.string().nullish(),
      twitterHandler: z.string().nullish(),
      officeHours: z.string().nullish(),
      plnFriend: z.boolean(),
      locationUid: z.string(),
    }),
    summary: 'Create a member',
  },
});
