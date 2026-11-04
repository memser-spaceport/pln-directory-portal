import { FollowsService } from './follows.service';
import type { PrismaService } from '../shared/prisma.service';

/**
 * LAB-3000, LAB-3018: News preferences shows each followed team's focus areas
 * under its name. The list returns every distinct top-level focus area of the
 * team (two child areas under one parent count once), or [] for a team with none.
 */
describe('FollowsService.getFollowedTeams focusAreas (LAB-3018)', () => {
  function buildService(teams: unknown[]) {
    const prisma = {
      follow: {
        findMany: jest.fn(async () => [
          { entityUid: 'two-areas', createdAt: new Date('2026-10-03T00:00:00Z') },
          { entityUid: 'one-area', createdAt: new Date('2026-10-02T00:00:00Z') },
          { entityUid: 'no-area', createdAt: new Date('2026-10-01T00:00:00Z') },
        ]),
        count: jest.fn(async () => 3),
        groupBy: jest.fn(async () => []),
      },
      team: { findMany: jest.fn(async () => teams) },
    };
    return { service: new FollowsService(prisma as unknown as PrismaService, { record: jest.fn() } as never), prisma };
  }

  it("returns all of the team's top-level focus areas, deduped, or [] when it has none", async () => {
    const { service, prisma } = buildService([
      {
        uid: 'two-areas',
        name: 'Filecoin Foundation',
        logo: null,
        teamFocusAreas: [
          { ancestorArea: { title: 'Digital Human Rights' } },
          { ancestorArea: { title: 'Economies & Governance' } },
          { ancestorArea: { title: 'Digital Human Rights' } },
        ],
      },
      { uid: 'one-area', name: 'IPFS', logo: null, teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }] },
      { uid: 'no-area', name: 'Acme', logo: null, teamFocusAreas: [] },
    ]);

    const result = await service.getFollowedTeams('m1', { page: 1, limit: 20 } as never);

    expect(result.items.map((i) => [i.uid, i.focusAreas])).toEqual([
      ['two-areas', ['Digital Human Rights', 'Economies & Governance']],
      ['one-area', ['Storage']],
      ['no-area', []],
    ]);
    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          teamFocusAreas: { select: { ancestorArea: { select: { title: true } } }, orderBy: { id: 'asc' } },
        }),
      })
    );
  });
});

describe('FollowsService member signals (LAB-3121)', () => {
  const findUnique = jest.fn();
  const deleteMany = jest.fn();
  const record = jest.fn();
  const prisma = {
    team: { findUnique: jest.fn(async () => ({ uid: 't1' })) },
    follow: {
      findUnique,
      upsert: jest.fn(async () => ({})),
      deleteMany,
      count: jest.fn(async () => 1),
      findFirst: jest.fn(async () => null),
    },
  };
  const service = new FollowsService(prisma as unknown as PrismaService, { record } as never);

  beforeEach(() => jest.clearAllMocks());

  it('records follow only when the member did not follow yet', async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1 });

    await service.followTeam('m1', 't1');
    await service.followTeam('m1', 't1');

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({ memberUid: 'm1', action: 'follow', entityType: 'TEAM', entityUid: 't1' });
  });

  it('records unfollow only when a follow was deleted', async () => {
    deleteMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    await service.unfollowTeam('m1', 't1');
    await service.unfollowTeam('m1', 't1');

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({ memberUid: 'm1', action: 'unfollow', entityType: 'TEAM', entityUid: 't1' });
  });
});
