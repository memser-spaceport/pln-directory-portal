import { FollowsService } from './follows.service';
import type { PrismaService } from '../shared/prisma.service';

/**
 * LAB-3000: News preferences shows each followed team's focus area under its
 * name, as in the digest-topics prototype. The list returns the team's first
 * top-level focus area, or null for a team with none.
 */
describe('FollowsService.getFollowedTeams focusArea (LAB-3000)', () => {
  function buildService(teams: unknown[]) {
    const prisma = {
      follow: {
        findMany: jest.fn(async () => [
          { entityUid: 'with-area', createdAt: new Date('2026-10-02T00:00:00Z') },
          { entityUid: 'no-area', createdAt: new Date('2026-10-01T00:00:00Z') },
        ]),
        count: jest.fn(async () => 2),
        groupBy: jest.fn(async () => []),
      },
      team: { findMany: jest.fn(async () => teams) },
    };
    return { service: new FollowsService(prisma as unknown as PrismaService), prisma };
  }

  it("returns the team's first top-level focus area, or null when it has none", async () => {
    const { service, prisma } = buildService([
      { uid: 'with-area', name: 'IPFS', logo: null, teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }] },
      { uid: 'no-area', name: 'Acme', logo: null, teamFocusAreas: [] },
    ]);

    const result = await service.getFollowedTeams('m1', { page: 1, limit: 20 } as never);

    expect(result.items.map((i) => [i.uid, i.focusArea])).toEqual([
      ['with-area', 'Storage'],
      ['no-area', null],
    ]);
    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          teamFocusAreas: { select: { ancestorArea: { select: { title: true } } }, orderBy: { id: 'asc' }, take: 1 },
        }),
      })
    );
  });
});
