import { DemoDayAdminScopeType, Prisma } from '@prisma/client';

/**
 * Seed host scopes for demo day admins.
 * Each record links a memberUid to allowed host domains.
 */
export const demoDayAdminScopes: Prisma.MemberDemoDayAdminScopeCreateManyInput[] = [
  // Admin 1 — full access to two demo day hosts
  {
    memberUid: 'demo-admin-uid-001',
    scopeType: DemoDayAdminScopeType.HOST,
    scopeValue: 'plnetwork.io',
  },
  {
    memberUid: 'demo-admin-uid-001',
    scopeType: DemoDayAdminScopeType.HOST,
    scopeValue: 'founders.plnetwork.io',
  },

  // Admin 2 — access only to enterprise demo day
  {
    memberUid: 'demo-admin-uid-002',
    scopeType: DemoDayAdminScopeType.HOST,
    scopeValue: 'enterprise.ai.plnetwork.io',
  },
];
