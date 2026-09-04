jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeamStatus } from '@prisma/client';

import type { PrismaService } from '../shared/prisma.service';
import type { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { TeamNewsService } from './team-news.service';
import type { TeamNewsPostSummaryService } from './team-news-post-summary.service';

type PrismaMock = {
  team: { findUnique: jest.Mock };
  teamNewsItem: { findMany: jest.Mock; create: jest.Mock; count: jest.Mock };
  teamNewsEnrichment: { upsert: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  team: { findUnique: jest.fn() },
  teamNewsItem: { findMany: jest.fn(), create: jest.fn(), count: jest.fn() },
  teamNewsEnrichment: { upsert: jest.fn() },
});

const buildPushMock = () => ({ create: jest.fn().mockResolvedValue(undefined) });

const buildSummaryMock = () => ({
  summarizeBody: jest.fn().mockResolvedValue('Short teaser from Gemini.'),
});

describe('TeamNewsService.createTeamPostedNews', () => {
  let service: TeamNewsService;
  let prisma: PrismaMock;
  let push: ReturnType<typeof buildPushMock>;
  let summary: ReturnType<typeof buildSummaryMock>;

  const memberRequestor = {
    uid: 'member-1',
    isDirectoryAdmin: false,
    teamMemberRoles: [{ teamUid: 'team-1' }],
  };

  beforeEach(() => {
    prisma = buildPrismaMock();
    push = buildPushMock();
    summary = buildSummaryMock();
    service = new TeamNewsService(
      prisma as unknown as PrismaService,
      push as unknown as PushNotificationsService,
      summary as unknown as TeamNewsPostSummaryService
    );

    prisma.team.findUnique.mockResolvedValue({ uid: 'team-1', status: TeamStatus.ACTIVE });
    prisma.teamNewsItem.findMany.mockResolvedValue([]);
    prisma.teamNewsItem.create.mockResolvedValue({ uid: 'news-new' });
    prisma.teamNewsItem.count.mockResolvedValue(1);
    prisma.teamNewsEnrichment.upsert.mockResolvedValue({});
  });

  it('throws NotFound when the team does not exist', async () => {
    prisma.team.findUnique.mockResolvedValue(null);
    await expect(
      service.createTeamPostedNews('missing', { title: 'Launch', url: 'https://example.com/post' }, memberRequestor)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Forbidden when the caller is neither admin nor team member', async () => {
    await expect(
      service.createTeamPostedNews(
        'team-1',
        { title: 'Launch', url: 'https://example.com/post' },
        { uid: 'outsider', isDirectoryAdmin: false, teamMemberRoles: [] }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows directory admins who are not team members', async () => {
    const result = await service.createTeamPostedNews(
      'team-1',
      { title: 'Launch', url: 'https://example.com/post' },
      { uid: 'admin-1', isDirectoryAdmin: true, teamMemberRoles: [] }
    );
    expect(result.uid).toBe('news-new');
  });

  it('rejects inactive teams', async () => {
    prisma.team.findUnique.mockResolvedValue({ uid: 'team-1', status: TeamStatus.INACTIVE });
    await expect(
      service.createTeamPostedNews('team-1', { title: 'Launch', url: 'https://example.com/post' }, memberRequestor)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate URLs for the same team', async () => {
    prisma.teamNewsItem.findMany.mockResolvedValue([
      {
        title: 'Earlier story',
        eventDate: new Date('2026-06-01T00:00:00.000Z'),
        sourceUrl: 'https://example.com/post?utm_source=x',
        sourceUrls: [],
      },
    ]);

    await expect(
      service.createTeamPostedNews('team-1', { title: 'Launch', url: 'https://www.example.com/post/' }, memberRequestor)
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a post with null summary when body is omitted', async () => {
    await service.createTeamPostedNews('team-1', { title: 'Launch', url: 'https://example.com/post' }, memberRequestor);

    expect(summary.summarizeBody).not.toHaveBeenCalled();
    expect(prisma.teamNewsItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Launch',
          summary: null,
          contentHtml: null,
          postedByMemberUid: 'member-1',
          eventType: 'ANNOUNCEMENT',
        }),
      })
    );
    expect(push.create).not.toHaveBeenCalled();
  });

  it('summarizes body content when provided', async () => {
    await service.createTeamPostedNews(
      'team-1',
      {
        title: 'Launch',
        url: 'https://example.com/post',
        body: '<p>We shipped a new release today.</p>',
      },
      memberRequestor
    );

    expect(summary.summarizeBody).toHaveBeenCalledWith('<p>We shipped a new release today.</p>', 'Launch');
    expect(prisma.teamNewsItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          summary: 'Short teaser from Gemini.',
          contentHtml: '<p>We shipped a new release today.</p>',
        }),
      })
    );
  });
});
