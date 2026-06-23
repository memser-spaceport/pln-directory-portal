import { NotFoundException } from '@nestjs/common';
import { JobOpeningStatus } from '@prisma/client';
import type { PrismaService } from '../shared/prisma.service';
import { JobOpeningsEnrichmentService } from './job-openings-enrichment.service';

type PrismaMock = {
  team: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  jobOpening: { findMany: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  team: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  jobOpening: { findMany: jest.fn() },
});

describe('JobOpeningsEnrichmentService', () => {
  let service: JobOpeningsEnrichmentService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new JobOpeningsEnrichmentService(prisma as unknown as PrismaService);
  });

  describe('getTeamsWithEnrichment', () => {
    it('stamps isPresentInPlPortfolio and isDiscontinued from team relations', async () => {
      prisma.team.findMany.mockResolvedValue([
        {
          uid: 'team-a',
          name: 'Portco Active',
          priority: 2,
          website: null,
          linkedinHandler: null,
          communityAffiliations: [{ title: 'PL Portfolio' }],
          industryTags: [],
          teamFocusAreas: [],
          jobEnrichment: null,
        },
        {
          uid: 'team-b',
          name: 'Discontinued Co',
          priority: 3,
          website: null,
          linkedinHandler: null,
          communityAffiliations: [],
          industryTags: [{ title: 'Discontinued' }],
          teamFocusAreas: [],
          jobEnrichment: null,
        },
        {
          uid: 'team-c',
          name: 'Plain Team',
          priority: 99,
          website: null,
          linkedinHandler: null,
          communityAffiliations: [],
          industryTags: [{ title: 'AI' }],
          teamFocusAreas: [],
          jobEnrichment: null,
        },
      ]);
      prisma.team.count.mockResolvedValue(3);

      const out = await service.getTeamsWithEnrichment(1, 100);

      expect(out.teams).toHaveLength(3);
      expect(out.teams[0]).toMatchObject({
        uid: 'team-a',
        priority: 2,
        isPresentInPlPortfolio: true,
        isDiscontinued: false,
      });
      expect(out.teams[1]).toMatchObject({
        uid: 'team-b',
        isPresentInPlPortfolio: false,
        isDiscontinued: true,
      });
      expect(out.teams[2]).toMatchObject({
        uid: 'team-c',
        priority: null,
        isPresentInPlPortfolio: false,
        isDiscontinued: false,
      });
    });
  });

  describe('getJobOpeningsByTeam', () => {
    const teamUid = 'clwsaznzq005gut02irrhntzc';
    const detectionDate = new Date('2026-05-03T00:19:50.371Z');
    const updatedAt = new Date('2026-05-03T00:19:56.505Z');
    const lastSeenLive = new Date('2026-06-01T12:00:00.000Z');

    it('returns reconciliation fields required by the enrichment client', async () => {
      prisma.team.findUnique.mockResolvedValue({ uid: teamUid, name: 'Airship' });
      prisma.jobOpening.findMany.mockResolvedValue([
        {
          uid: 'job-uid-1',
          canonicalKey: 'airship||strategy coordinator||remote - u.s.',
          dedupKey: 'https://job-boards.eu.greenhouse.io/airship/jobs/4673656101',
          teamUid,
          roleTitle: 'Strategy Coordinator',
          roleCategory: 'Leadership/Exec',
          seniority: 'Principal+ (L6-L7)',
          location: ['US'],
          workMode: 'remote',
          sourceLink: 'https://job-boards.eu.greenhouse.io/airship/jobs/4673656101',
          postedDate: new Date('2025-09-16T17:04:06.000Z'),
          lastSeenLive,
          status: JobOpeningStatus.NEW,
          detectionDate,
          updatedAt,
        },
      ]);

      const out = await service.getJobOpeningsByTeam(teamUid);

      expect(out.teamUid).toBe(teamUid);
      expect(out.teamName).toBe('Airship');
      expect(out.jobOpenings).toHaveLength(1);
      expect(out.jobOpenings[0]).toMatchObject({
        uid: 'job-uid-1',
        canonicalKey: 'airship||strategy coordinator||remote - u.s.',
        dedupKey: 'https://job-boards.eu.greenhouse.io/airship/jobs/4673656101',
        teamUid,
        roleTitle: 'Strategy Coordinator',
        lastSeenLive: lastSeenLive.toISOString(),
        status: JobOpeningStatus.NEW,
      });
    });

    it('throws when team is not found', async () => {
      prisma.team.findUnique.mockResolvedValue(null);
      await expect(service.getJobOpeningsByTeam(teamUid)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
