import { DemoDayStatus, Prisma } from '@prisma/client';

/**
 * Seed demo days with different hosts and statuses.
 * These records are used for development/testing of host-based demo day admin logic
 * and demo day dashboard APIs.
 */
export const demoDays: Prisma.DemoDayCreateManyInput[] = [
  // ACTIVE demo day - main test data for dashboard APIs
  {
    uid: 'demo-day-global-2026',
    slugURL: 'global-2026',
    host: 'plnetwork.io',
    title: 'Global Demo Day 2026',
    description: 'Main PL Network Demo Day 2026 (seeded)',
    startDate: new Date('2026-01-01T10:00:00.000Z'),
    endDate: new Date('2026-10-01T16:00:00.000Z'),
    status: DemoDayStatus.ACTIVE,
  },
  // COMPLETED demo day - for multi-demo day testing
  {
    uid: 'demo-day-completed-2024',
    slugURL: 'completed-2024',
    host: 'plnetwork.io',
    title: 'Completed Demo Day 2024',
    description: 'Past demo day for testing aggregation (seeded)',
    startDate: new Date('2024-09-15T10:00:00.000Z'),
    endDate: new Date('2024-09-15T16:00:00.000Z'),
    status: DemoDayStatus.COMPLETED,
  },
  // REGISTRATION_OPEN demo day
  {
    uid: 'demo-day-registration-open',
    slugURL: 'founders-lab',
    host: 'founders.plnetwork.io',
    title: 'Founders Lab Demo Day',
    description: 'Founders-focused demo day (seeded)',
    startDate: new Date('2025-05-10T11:00:00.000Z'),
    endDate: new Date('2025-05-10T17:00:00.000Z'),
    status: DemoDayStatus.REGISTRATION_OPEN,
  },
  // EARLY_ACCESS demo day
  {
    uid: 'demo-day-early-access',
    slugURL: 'enterprise-ai',
    host: 'enterprise.ai.plnetwork.io',
    title: 'Enterprise AI Demo Day',
    description: 'Enterprise partners showcase AI solutions (seeded)',
    startDate: new Date('2025-06-15T09:00:00.000Z'),
    endDate: new Date('2025-06-15T18:00:00.000Z'),
    status: DemoDayStatus.EARLY_ACCESS,
  },
  // UPCOMING demo day
  {
    uid: 'demo-day-upcoming',
    slugURL: 'upcoming-2026',
    host: 'plnetwork.io',
    title: 'Upcoming Demo Day 2026',
    description: 'Future demo day (seeded)',
    startDate: new Date('2026-03-02T10:00:00.000Z'),
    endDate: new Date('2026-03-02T16:00:00.000Z'),
    status: DemoDayStatus.UPCOMING,
  },
  // ARCHIVED demo day
  {
    uid: 'demo-day-archived',
    slugURL: 'archived-2023',
    host: 'plnetwork.io',
    title: 'Archived Demo Day 2023',
    description: 'Archived demo day (seeded)',
    startDate: new Date('2023-06-15T10:00:00.000Z'),
    endDate: new Date('2023-06-15T16:00:00.000Z'),
    status: DemoDayStatus.ARCHIVED,
  },
];
