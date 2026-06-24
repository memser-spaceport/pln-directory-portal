import { NotFoundException } from '@nestjs/common';
import { TeamNewsQueryService } from './team-news-query.service';
import { PrismaService } from '../shared/prisma.service';

describe('TeamNewsQueryService.listTeamNewsByTeam', () => {
  let service: TeamNewsQueryService;

  const teamFindUnique = jest.fn();
  const teamNewsItemFindMany = jest.fn();
  const teamNewsItemCount = jest.fn();
  const teamNewsForumLinkFindMany = jest.fn();

  const prismaMock = {
    team: { findUnique: teamFindUnique },
    teamNewsItem: { findMany: teamNewsItemFindMany, count: teamNewsItemCount },
    teamNewsForumLink: { findMany: teamNewsForumLinkFindMany },
  } as unknown as PrismaService;

  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    uid: 'news-1',
    teamUid: 'team-1',
    eventType: 'FUNDING',
    eventDate: new Date('2026-06-01T00:00:00.000Z'),
    title: 'Raised Series A',
    summary: 'Funding round closed',
    sourceUrl: 'https://example.com/news',
    sourceDomain: 'example.com',
    tags: ['funding'],
    createdAt: new Date('2026-06-02T00:00:00.000Z'),
    team: {
      uid: 'team-1',
      name: 'Acme Labs',
      logo: { url: 'https://example.com/logo.png' },
      teamFocusAreas: [
        {
          focusArea: { title: 'Neurotech', parentUid: 'fa-parent' },
          ancestorArea: { title: 'Neurotech' },
        },
      ],
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    teamFindUnique.mockResolvedValue({ uid: 'team-1', name: 'Acme Labs' });
    teamNewsItemFindMany.mockResolvedValue([makeRow()]);
    teamNewsItemCount.mockResolvedValue(1);
    teamNewsForumLinkFindMany.mockResolvedValue([]);
    service = new TeamNewsQueryService(prismaMock);
  });

  it('throws NotFound when the team does not exist', async () => {
    teamFindUnique.mockResolvedValue(null);

    await expect(service.listTeamNewsByTeam('missing-team', { page: 1, limit: 50 })).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(teamNewsItemFindMany).not.toHaveBeenCalled();
  });

  it('returns paginated news ordered newest first for the team', async () => {
    const result = await service.listTeamNewsByTeam('team-1', { page: 2, limit: 10 });

    expect(result).toEqual({
      teamUid: 'team-1',
      teamName: 'Acme Labs',
      page: 2,
      limit: 10,
      total: 1,
      items: [
        expect.objectContaining({
          uid: 'news-1',
          teamUid: 'team-1',
          teamName: 'Acme Labs',
          title: 'Raised Series A',
          discussion: { count: 0, latestTopicUrl: null },
        }),
      ],
    });

    expect(teamNewsItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ teamUid: 'team-1' }] },
        orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
        skip: 10,
        take: 10,
      })
    );
  });

  it('applies search across title, summary, and source domain', async () => {
    await service.listTeamNewsByTeam('team-1', { page: 1, limit: 50, q: 'series' });

    expect(teamNewsItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { teamUid: 'team-1' },
            {
              OR: [
                { title: { contains: 'series', mode: 'insensitive' } },
                { summary: { contains: 'series', mode: 'insensitive' } },
                { sourceDomain: { contains: 'series', mode: 'insensitive' } },
              ],
            },
          ],
        },
      })
    );
  });
});
