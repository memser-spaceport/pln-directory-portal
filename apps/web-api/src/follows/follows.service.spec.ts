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
    return { service: new FollowsService(prisma as unknown as PrismaService), prisma };
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
