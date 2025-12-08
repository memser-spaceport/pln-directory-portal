import { DemoDayStatus, Prisma } from '@prisma/client';

/**
 * Seed demo days with different hosts.
 * These records are used for development/testing of host-based demo day admin logic.
 */
export const demoDays: Prisma.DemoDayCreateManyInput[] = [
  {
    slugURL: 'global-2025',
    host: 'plnetwork.io',
    title: 'Global Demo Day 2025',
    description: 'Main PL Network Demo Day 2025 (seeded)',
    startDate: new Date('2025-03-02T10:00:00.000Z'),
    endDate: new Date('2025-03-02T16:00:00.000Z'),
    status: DemoDayStatus.UPCOMING,
  },
  {
    slugURL: 'founders-lab',
    host: 'founders.plnetwork.io',
    title: 'Founders Lab Demo Day',
    description: 'Founders-focused demo day (seeded)',
    startDate: new Date('2025-05-10T11:00:00.000Z'),
    endDate: new Date('2025-05-10T17:00:00.000Z'),
    status: DemoDayStatus.UPCOMING,
  },
  {
    slugURL: 'enterprise-ai',
    host: 'enterprise.ai.plnetwork.io',
    title: 'Enterprise AI Demo Day',
    description: 'Enterprise partners showcase AI solutions (seeded)',
    startDate: new Date('2025-06-15T09:00:00.000Z'),
    endDate: new Date('2025-06-15T18:00:00.000Z'),
    status: DemoDayStatus.UPCOMING,
  },
];
