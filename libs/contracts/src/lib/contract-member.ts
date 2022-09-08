import { initContract } from '@ts-rest/core';
import { z } from 'zod';

export interface Post {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  published: boolean;
  tags: string[];
}

const MemberSchema = z.object({
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
  createdAt: z.date(),
  updatedAt: z.date(),
  locationUid: z.string(),
});

const c = initContract();

export const apiMember = c.router({
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
