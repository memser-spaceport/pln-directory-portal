import { Prisma } from '@prisma/client';

/**
 * Seed DemoDayExpressInterestStatistic records for demo day testing.
 * These represent engagement data between investors and teams.
 *
 * Engagement summary:
 * - Investor 0 -> Team 0: liked + connected + invested (3 engagements)
 * - Investor 0 -> Team 1: liked only (1 engagement)
 * - Investor 1 -> Team 0: connected + referral + feedback (3 engagements)
 * - Investor 2 -> Team 0 in COMPLETED: all 5 activities (5 engagements)
 */
export const demoDayExpressInterestStats: Prisma.DemoDayExpressInterestStatisticCreateManyInput[] = [
  // Investor 0 -> Team 0: liked + connected + invested
  {
    uid: 'demo-stat-inv0-team0-active',
    demoDayUid: 'demo-day-global-2026',
    memberUid: 'demo-investor-0',
    teamFundraisingProfileUid: 'demo-tfp-team0-active',
    isPrepDemoDay: false,
    liked: true,
    connected: true,
    invested: true,
    referral: false,
    feedback: false,
    likedCount: 1,
    connectedCount: 1,
    investedCount: 1,
    referralCount: 0,
    feedbackCount: 0,
    totalCount: 3,
    createdAt: new Date('2026-03-02T12:00:00.000Z'),
    updatedAt: new Date('2026-03-02T14:00:00.000Z'),
  },
  // Investor 0 -> Team 1: liked only
  {
    uid: 'demo-stat-inv0-team1-active',
    demoDayUid: 'demo-day-global-2026',
    memberUid: 'demo-investor-0',
    teamFundraisingProfileUid: 'demo-tfp-team1-active',
    isPrepDemoDay: false,
    liked: true,
    connected: false,
    invested: false,
    referral: false,
    feedback: false,
    likedCount: 1,
    connectedCount: 0,
    investedCount: 0,
    referralCount: 0,
    feedbackCount: 0,
    totalCount: 1,
    createdAt: new Date('2026-03-02T13:00:00.000Z'),
    updatedAt: new Date('2026-03-02T13:00:00.000Z'),
  },
  // Investor 1 -> Team 0: connected + referral + feedback
  {
    uid: 'demo-stat-inv1-team0-active',
    demoDayUid: 'demo-day-global-2026',
    memberUid: 'demo-investor-1',
    teamFundraisingProfileUid: 'demo-tfp-team0-active',
    isPrepDemoDay: false,
    liked: false,
    connected: true,
    invested: false,
    referral: true,
    feedback: true,
    likedCount: 0,
    connectedCount: 1,
    investedCount: 0,
    referralCount: 1,
    feedbackCount: 1,
    totalCount: 3,
    createdAt: new Date('2026-03-02T11:30:00.000Z'),
    updatedAt: new Date('2026-03-02T15:00:00.000Z'),
  },
  // Investor 2 -> Team 0 in COMPLETED demo day: all 5 activities
  {
    uid: 'demo-stat-inv2-team0-completed',
    demoDayUid: 'demo-day-completed-2024',
    memberUid: 'demo-investor-2',
    teamFundraisingProfileUid: 'demo-tfp-team0-completed',
    isPrepDemoDay: false,
    liked: true,
    connected: true,
    invested: true,
    referral: true,
    feedback: true,
    likedCount: 1,
    connectedCount: 1,
    investedCount: 1,
    referralCount: 1,
    feedbackCount: 1,
    totalCount: 5,
    createdAt: new Date('2024-09-15T10:00:00.000Z'),
    updatedAt: new Date('2024-09-15T16:00:00.000Z'),
  },
];
