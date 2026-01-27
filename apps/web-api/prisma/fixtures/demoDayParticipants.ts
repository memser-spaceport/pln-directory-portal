import { DemoDayParticipantType, DemoDayParticipantStatus, Prisma } from '@prisma/client';

/**
 * Seed DemoDayParticipant records for demo day testing.
 * - 3 INVESTOR participants (Members 0-2) with ENABLED status
 * - 3 FOUNDER participants (Members 3-4) linked to Teams 0-1 with ENABLED status
 * - Spread across ACTIVE and COMPLETED demo days for multi-demo day testing
 */
export const demoDayParticipants: Prisma.DemoDayParticipantCreateManyInput[] = [
  // Investor 0 in ACTIVE demo day
  {
    uid: 'demo-participant-inv0-active',
    demoDayUid: 'demo-day-global-2026',
    memberUid: 'demo-investor-0',
    type: DemoDayParticipantType.INVESTOR,
    status: DemoDayParticipantStatus.ENABLED,
    confidentialityAccepted: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Investor 1 in ACTIVE demo day
  {
    uid: 'demo-participant-inv1-active',
    demoDayUid: 'demo-day-global-2026',
    memberUid: 'demo-investor-1',
    type: DemoDayParticipantType.INVESTOR,
    status: DemoDayParticipantStatus.ENABLED,
    confidentialityAccepted: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Investor 2 in COMPLETED demo day (for multi-demo day testing)
  {
    uid: 'demo-participant-inv2-completed',
    demoDayUid: 'demo-day-completed-2024',
    memberUid: 'demo-investor-2',
    type: DemoDayParticipantType.INVESTOR,
    status: DemoDayParticipantStatus.ENABLED,
    confidentialityAccepted: true,
    createdAt: new Date('2024-09-01'),
    updatedAt: new Date('2024-09-15'),
  },
  // Founder 0 for Team 0 in ACTIVE demo day
  {
    uid: 'demo-participant-founder0-active',
    demoDayUid: 'demo-day-global-2026',
    memberUid: 'demo-founder-0',
    teamUid: 'demo-team-0',
    type: DemoDayParticipantType.FOUNDER,
    status: DemoDayParticipantStatus.ENABLED,
    confidentialityAccepted: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Founder 1 for Team 1 in ACTIVE demo day
  {
    uid: 'demo-participant-founder1-active',
    demoDayUid: 'demo-day-global-2026',
    memberUid: 'demo-founder-1',
    teamUid: 'demo-team-1',
    type: DemoDayParticipantType.FOUNDER,
    status: DemoDayParticipantStatus.ENABLED,
    confidentialityAccepted: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Founder 0 for Team 0 in COMPLETED demo day (for multi-demo day testing)
  {
    uid: 'demo-participant-founder0-completed',
    demoDayUid: 'demo-day-completed-2024',
    memberUid: 'demo-founder-0',
    teamUid: 'demo-team-0',
    type: DemoDayParticipantType.FOUNDER,
    status: DemoDayParticipantStatus.ENABLED,
    confidentialityAccepted: true,
    createdAt: new Date('2024-09-01'),
    updatedAt: new Date('2024-09-15'),
  },
];
