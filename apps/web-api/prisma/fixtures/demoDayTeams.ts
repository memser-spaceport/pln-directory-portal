import { Prisma } from '@prisma/client';

/**
 * Seed teams for demo day.
 * These teams will have founders and fundraising profiles.
 */
export const demoDayTeams: Prisma.TeamCreateManyInput[] = [
  {
    uid: 'demo-team-0',
    name: 'Randamu Labs',
    shortDescription: 'Building decentralized infrastructure (seeded)',
    longDescription: 'A startup focused on frontier tech solutions',
    website: 'https://randamu.example.com',
    accessLevel: 'L1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    uid: 'demo-team-1',
    name: 'DataFlow AI',
    shortDescription: 'AI-powered data tooling (seeded)',
    longDescription: 'An AI startup building data infrastructure',
    website: 'https://dataflow.example.com',
    accessLevel: 'L1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];
