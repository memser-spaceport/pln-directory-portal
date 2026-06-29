import {
  enrichOrgConnectorTeams,
  loadDirectoryTeamIndex,
  lookupTeamForOrg,
  type DirectoryTeamIndex,
} from './org-team-resolve.util';
import { buildTeamMatchIndex } from '../affinity/affinity-match.util';
import { firmKey } from './firm-key.util';
import type { OrgConnectorLike, RouteNodeLike } from './org-contact-resolve.util';

function makeIndex(
  teams: Array<{ uid: string; name: string; website?: string | null; logoUrl?: string }>
): DirectoryTeamIndex {
  const byUid = new Map(teams.map((t) => [t.uid, { teamUid: t.uid, logoUrl: t.logoUrl }]));
  const byFirmKey = new Map<string, string>();
  for (const t of teams) {
    byFirmKey.set(firmKey(t.name), t.uid);
  }
  return {
    match: buildTeamMatchIndex(
      teams.map((t) => ({
        uid: t.uid,
        name: t.name,
        website: t.website ?? null,
        airtableRecId: null,
      }))
    ),
    byFirmKey,
    byUid,
  };
}

describe('lookupTeamForOrg', () => {
  const index = makeIndex([
    { uid: 'uid-coinlist', name: 'CoinList', website: 'https://coinlist.co', logoUrl: 'https://img/coinlist.png' },
    { uid: 'uid-modular', name: 'Modular Globe', website: null },
  ]);

  it('matches by website domain', () => {
    expect(lookupTeamForOrg({ name: 'CoinList', website: 'coinlist.co' }, index)).toEqual({
      teamUid: 'uid-coinlist',
      logoUrl: 'https://img/coinlist.png',
    });
  });

  it('matches by firmKey when domain absent', () => {
    expect(lookupTeamForOrg({ name: 'Modular Globe', website: null }, index)?.teamUid).toBe('uid-modular');
  });

  it('returns null when no team matches', () => {
    expect(lookupTeamForOrg({ name: 'Sequoia Capital', website: 'sequoiacap.com' }, index)).toBeNull();
  });
});

describe('enrichOrgConnectorTeams', () => {
  const index = makeIndex([
    { uid: 'uid-coinbase', name: 'Coinbase', website: 'https://coinbase.com', logoUrl: 'https://img/cb.png' },
  ]);

  it('sets teamUid on orgConnector and matching routeNodes', () => {
    const out = enrichOrgConnectorTeams(
      {
        orgConnectors: [
          {
            name: 'Coinbase',
            description: 'co-invested',
            tags: ['Org connection'],
            website: 'coinbase.com',
            contacts: [{ name: 'Jonathan King', email: 'jonathan.king@coinbase.com', source: 'gold_list' }],
          },
        ],
        routeNodes: [
          {
            label: 'Jonathan King',
            orgName: 'Coinbase',
            variant: 'external',
          },
        ],
      },
      index
    ) as { orgConnectors: OrgConnectorLike[]; routeNodes: RouteNodeLike[] };

    expect(out.orgConnectors[0]?.teamUid).toBe('uid-coinbase');
    expect(out.orgConnectors[0]?.logo).toBe('https://img/cb.png');
    expect(out.routeNodes[0]?.teamUid).toBe('uid-coinbase');
  });

  it('does not overwrite existing teamUid', () => {
    const out = enrichOrgConnectorTeams(
      {
        orgConnector: {
          name: 'Coinbase',
          description: 'x',
          tags: [],
          teamUid: 'existing-uid',
        },
      },
      index
    ) as { orgConnector: OrgConnectorLike };
    expect(out.orgConnector?.teamUid).toBe('existing-uid');
  });
});

describe('loadDirectoryTeamIndex', () => {
  it('excludes L0 and Rejected teams', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { team: { findMany } } as unknown as import('@prisma/client').PrismaClient;

    await loadDirectoryTeamIndex(prisma);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accessLevel: { notIn: ['L0', 'Rejected'] } },
      })
    );
  });
});
