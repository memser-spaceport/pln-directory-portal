import { matchTeamFromCompanyName } from './member-enrichment-team-match.util';

function mockPrisma(teams: Array<{ uid: string; name: string }>) {
  return {
    team: {
      findFirst: jest.fn(({ where }: any) => {
        const needle = where.name.equals.toLowerCase();
        return Promise.resolve(teams.find((t) => t.name.toLowerCase() === needle) ?? null);
      }),
      findMany: jest.fn(() => Promise.resolve([...teams].sort((a, b) => a.name.localeCompare(b.name)))),
    },
  } as any;
}

describe('matchTeamFromCompanyName', () => {
  it('returns null for empty/missing company name', async () => {
    const prisma = mockPrisma([{ uid: 't1', name: 'Acme' }]);
    expect(await matchTeamFromCompanyName(prisma, null)).toBeNull();
    expect(await matchTeamFromCompanyName(prisma, '')).toBeNull();
    expect(await matchTeamFromCompanyName(prisma, '   ')).toBeNull();
  });

  it('matches on exact case-insensitive name equality', async () => {
    const prisma = mockPrisma([{ uid: 't1', name: 'Acme Robotics' }]);
    const result = await matchTeamFromCompanyName(prisma, 'acme robotics');
    expect(result).toEqual({ uid: 't1', name: 'Acme Robotics' });
  });

  it('falls back to a shared substantive name token when no exact match exists', async () => {
    const prisma = mockPrisma([{ uid: 't1', name: 'Acme Robotics Labs' }]);
    const result = await matchTeamFromCompanyName(prisma, 'Acme Robotics');
    expect(result).toEqual({ uid: 't1', name: 'Acme Robotics Labs' });
  });

  it('returns null when nothing matches, never inventing a team', async () => {
    const prisma = mockPrisma([{ uid: 't1', name: 'Beta Systems' }]);
    const result = await matchTeamFromCompanyName(prisma, 'Completely Unrelated Co');
    expect(result).toBeNull();
  });

  it('does not false-positive on a generic stopword-only overlap', async () => {
    const prisma = mockPrisma([{ uid: 't1', name: 'Beta Labs' }]);
    // Both contain "labs", a stopword `namesShareSubstantiveToken` drops.
    const result = await matchTeamFromCompanyName(prisma, 'Gamma Labs');
    expect(result).toBeNull();
  });
});
