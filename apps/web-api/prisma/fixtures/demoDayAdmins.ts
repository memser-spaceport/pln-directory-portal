import { Prisma } from '@prisma/client';

/**
 * Seed demo day admin members.
 * These users will receive demo-day admin scopes (HOST).
 */
export const demoDayAdmins: Prisma.MemberCreateManyInput[] = [
  {
    uid: 'demo-admin-uid-001',
    name: 'Demo Day Admin One',
    email: 'demoday-admin-1@example.com',
    accessLevel: 'L4',
    approvedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    uid: 'demo-admin-uid-002',
    name: 'Demo Day Admin Two',
    email: 'demoday-admin-2@example.com',
    accessLevel: 'L4',
    approvedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];
