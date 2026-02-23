import { Prisma } from '@prisma/client';

/**
 * Seed members for demo day.
 * - Members 0-2: Investors
 * - Members 3-4: Founders
 */
export const demoDayMembers: Prisma.MemberCreateManyInput[] = [
  // Investor 0 - ANGEL type
  {
    uid: 'demo-investor-0',
    name: 'Alice Investor',
    email: 'alice.investor@example.com',
    accessLevel: 'L5',
    isInvestor: true,
    isVerified: true,
    approvedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Investor 1 - FUND type
  {
    uid: 'demo-investor-1',
    name: 'Bob Investor',
    email: 'bob.investor@example.com',
    accessLevel: 'L5',
    isInvestor: true,
    isVerified: true,
    approvedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Investor 2 - ANGEL_AND_FUND type
  {
    uid: 'demo-investor-2',
    name: 'Carol Investor',
    email: 'carol.investor@example.com',
    accessLevel: 'L6',
    isInvestor: true,
    isVerified: true,
    approvedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Founder 0 - for Team 0
  {
    uid: 'demo-founder-0',
    name: 'David Founder',
    email: 'david.founder@example.com',
    accessLevel: 'L4',
    isVerified: true,
    approvedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Founder 1 - for Team 1
  {
    uid: 'demo-founder-1',
    name: 'Eva Founder',
    email: 'eva.founder@example.com',
    accessLevel: 'L4',
    isVerified: true,
    approvedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];
