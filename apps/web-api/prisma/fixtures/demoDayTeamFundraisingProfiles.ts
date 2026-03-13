import { TeamFundraisingProfileStatus, Prisma } from '@prisma/client';

/**
 * Seed TeamFundraisingProfile records for demo day testing.
 * - Team 0 in ACTIVE demo day (published)
 * - Team 1 in ACTIVE demo day (published)
 * - Team 0 in COMPLETED demo day (for multi-demo day testing)
 */
export const demoDayTeamFundraisingProfiles: Prisma.TeamFundraisingProfileCreateManyInput[] = [
  // Team 0 in ACTIVE demo day
  {
    uid: 'demo-tfp-team0-active',
    teamUid: 'demo-team-0',
    demoDayUid: 'demo-day-global-2026',
    description: 'Randamu Labs fundraising profile for Global Demo Day 2026',
    status: TeamFundraisingProfileStatus.PUBLISHED,
    onePagerUploadUid: null,
    videoUploadUid: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Team 1 in ACTIVE demo day
  {
    uid: 'demo-tfp-team1-active',
    teamUid: 'demo-team-1',
    demoDayUid: 'demo-day-global-2026',
    description: 'DataFlow AI fundraising profile for Global Demo Day 2026',
    status: TeamFundraisingProfileStatus.PUBLISHED,
    onePagerUploadUid: null,
    videoUploadUid: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Team 0 in COMPLETED demo day (for multi-demo day testing)
  {
    uid: 'demo-tfp-team0-completed',
    teamUid: 'demo-team-0',
    demoDayUid: 'demo-day-completed-2024',
    description: 'Randamu Labs fundraising profile for Completed Demo Day 2024',
    status: TeamFundraisingProfileStatus.PUBLISHED,
    onePagerUploadUid: null,
    videoUploadUid: null,
    createdAt: new Date('2024-09-01'),
    updatedAt: new Date('2024-09-15'),
  },
];
