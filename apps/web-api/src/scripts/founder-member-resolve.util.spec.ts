import {
  enrichFounderContacts,
  normalizePersonName,
  parseBridgeTeamName,
  type FounderResolveIndexes,
  type HopChainForFounderResolve,
  type PortfolioTeamIndex,
} from './founder-member-resolve.util';

const modularTeam = {
  teamUid: 'team-modular',
  teamName: 'Modular Globe',
  logoUrl: 'https://logo.example/modular.png',
  founders: [
    { name: 'Jane Founder', memberUid: 'uid-jane' },
    { name: 'Bob Co-founder', memberUid: 'uid-bob' },
  ],
};

function indexes(overrides?: Partial<FounderResolveIndexes>): FounderResolveIndexes {
  const portfolioTeams: PortfolioTeamIndex = new Map();
  portfolioTeams.set(normalizePersonName('Modular Globe'), modularTeam);
  return {
    portfolioTeams,
    membersByName: new Map([['roman khafizianov', 'uid-roman']]),
    ...overrides,
  };
}

describe('founder-member-resolve.util', () => {
  it('parses bridge team from evidence', () => {
    expect(parseBridgeTeamName('co-invested via Modular Globe')).toBe('Modular Globe');
  });

  it('resolves contact via portfolio team founders', () => {
    const out = enrichFounderContacts(
      {
        contact: { name: 'Jane Founder', role: 'CEO' },
        edges: [{ evidence: 'co-invested via Modular Globe' }],
        routeNodes: [{ label: 'Jane Founder', variant: 'external' }],
      },
      indexes()
    ) as HopChainForFounderResolve;
    expect(out.contact?.memberUid).toBe('uid-jane');
    expect(out.contact?.teams?.[0]?.teamUid).toBe('team-modular');
  });

  it('resolves via global name when team match fails', () => {
    const out = enrichFounderContacts(
      {
        contact: { name: 'Roman Khafizianov', role: 'Founder' },
        routeNodes: [{ label: 'Roman Khafizianov', variant: 'external' }],
      },
      indexes()
    ) as HopChainForFounderResolve;
    expect(out.contact?.memberUid).toBe('uid-roman');
  });

  it('leaves VC org paths unchanged', () => {
    const hc = {
      orgConnector: { name: 'CoinList', description: 'x', tags: ['Org connection'] },
      routeNodes: [{ label: 'CoinList', variant: 'org' as const }],
    };
    expect(enrichFounderContacts(hc, indexes())).toEqual(hc);
  });

  it('enriches connectorTeam leads', () => {
    const out = enrichFounderContacts(
      {
        connectorTeam: {
          name: 'Modular Globe',
          leads: [
            { name: 'Jane Founder', role: 'CEO' },
            { name: 'Bob Co-founder', role: 'CTO' },
          ],
        },
        edges: [{ evidence: 'co-invested via Modular Globe' }],
      },
      indexes()
    ) as HopChainForFounderResolve;
    expect(out.connectorTeam?.teamUid).toBe('team-modular');
    expect(out.connectorTeam?.leads[0].memberUid).toBe('uid-jane');
    expect(out.connectorTeam?.leads[1].memberUid).toBe('uid-bob');
    expect(out.contact?.name).toBe('Jane Founder');
  });

  it('leaves unmatched founders without memberUid', () => {
    const out = enrichFounderContacts(
      { contact: { name: 'Unknown Person', role: 'Founder' } },
      indexes({ membersByName: new Map() })
    ) as HopChainForFounderResolve;
    expect(out.contact?.memberUid).toBeUndefined();
  });

  it('skips ambiguous global name matches', () => {
    const out = enrichFounderContacts(
      { contact: { name: 'John Smith', role: 'Founder' } },
      indexes({ membersByName: new Map() })
    ) as HopChainForFounderResolve;
    expect(out.contact?.memberUid).toBeUndefined();
  });
});
