import { NotFoundException } from '@nestjs/common';
import { JobOpeningStatus } from '@prisma/client';
import type { PrismaService } from '../shared/prisma.service';
import { JobOpeningsEnrichmentService } from './job-openings-enrichment.service';

type PrismaMock = {
  team: { findUnique: jest.Mock };
  jobOpening: { findMany: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  team: { findUnique: jest.fn() },
  jobOpening: { findMany: jest.fn() },
});

describe('JobOpeningsEnrichmentService', () => {
  let service: JobOpeningsEnrichmentService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new JobOpeningsEnrichmentService(prisma as unknown as PrismaService);
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
