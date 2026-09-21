// MemberCvImportsService's dependency graph reaches an ESM-only package Jest will
// not parse; the feed is driven through a stub at the module boundary.
jest.mock('../member-cv-imports/member-cv-imports.service', () => ({ MemberCvImportsService: class {} }));

import type { MemberCvImportsService } from '../member-cv-imports/member-cv-imports.service';
import type { PrismaService } from '../shared/prisma.service';
import { IntegrationCandidatesService } from './integration-candidates.service';

/**
 * The Hiring tab (LAB-2580) added `sendToAts` to the same three tables this feed
 * reads. Nothing here filters on it: Protocol Labs is the only team with a key
 * and it has no Hiring tab, so filtering would change a contract the ATS poll is
 * tested against for behavior no team can reach. This spec pins that down.
 */

const member = (uid: string) => ({
  uid,
  name: `Member ${uid}`,
  email: `${uid}@example.com`,
  skills: [],
  location: null,
  teamMemberRoles: [],
});

describe('IntegrationCandidatesService — triage flags do not filter the feed', () => {
  let prisma: any;
  let service: IntegrationCandidatesService;

  beforeAll(() => {
    process.env.WEB_UI_BASE_URL = 'https://os.pl.xyz';
  });

  beforeEach(() => {
    prisma = {
      jobApplication: { findMany: jest.fn().mockResolvedValue([]) },
      jobOpeningInterest: { findMany: jest.fn().mockResolvedValue([]) },
      teamInterest: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new IntegrationCandidatesService(
      prisma as unknown as PrismaService,
      {
        getSignedPreviewUrls: jest.fn().mockResolvedValue(new Map()),
      } as unknown as MemberCvImportsService
    );
  });

  it('returns both a flagged and an unflagged interest', async () => {
    prisma.jobOpeningInterest.findMany.mockResolvedValue([
      {
        uid: 'int-flagged',
        createdAt: new Date('2026-09-01T10:00:00Z'),
        updatedAt: new Date('2026-09-01T10:00:00Z'),
        sendToAts: true,
        jobOpening: { uid: 'job-1', roleTitle: 'Platform Lead', teamUid: 'team-1' },
        member: member('m-1'),
      },
      {
        uid: 'int-unflagged',
        createdAt: new Date('2026-09-02T10:00:00Z'),
        updatedAt: new Date('2026-09-02T10:00:00Z'),
        sendToAts: false,
        jobOpening: { uid: 'job-1', roleTitle: 'Platform Lead', teamUid: 'team-1' },
        member: member('m-2'),
      },
    ]);

    const page = await service.feed('team-1', {});

    expect(page.interests.map((row) => row.uid)).toEqual(['int-flagged', 'int-unflagged']);
  });

  it('does not narrow any of the three reads by a triage column', async () => {
    await service.feed('team-1', {});

    const wheres = [
      prisma.jobApplication.findMany.mock.calls[0][0].where,
      prisma.jobOpeningInterest.findMany.mock.calls[0][0].where,
      prisma.teamInterest.findMany.mock.calls[0][0].where,
    ];
    const asText = JSON.stringify(wheres);
    expect(asText).not.toContain('sendToAts');
    expect(asText).not.toContain('viewedAt');
    expect(asText).not.toContain('reviewedAt');
  });
});
