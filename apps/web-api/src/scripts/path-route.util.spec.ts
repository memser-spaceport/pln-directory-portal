import {
  buildFullRouteNodes,
  buildInvestorRouteNode,
  finalizePersonHopChain,
  PROTOCOL_LABS_ORG_NODE,
} from './path-route.util';
import { buildTeamMatchIndex } from '../affinity/affinity-match.util';
import type { DirectoryTeamIndex } from './org-team-resolve.util';
import { firmKey } from './firm-key.util';

function teamIndexForCoinbase(): DirectoryTeamIndex {
  const uid = 'uid-coinbase';
  return {
    match: buildTeamMatchIndex([{ uid, name: 'Coinbase', website: 'https://coinbase.com', airtableRecId: null }]),
    byFirmKey: new Map([[firmKey('Coinbase'), uid]]),
    byUid: new Map([[uid, { teamUid: uid, logoUrl: 'https://img/cb.png' }]]),
  };
}

describe('path-route.util (seed)', () => {
  describe('buildFullRouteNodes', () => {
    const investor = buildInvestorRouteNode({ firstName: 'Rauno', lastName: 'Miljand' });
    const bridge = [{ label: 'CoinList', variant: 'org' as const }];

    it('case 2 prepends PL connector before bridge', () => {
      const nodes = buildFullRouteNodes({
        bridgeNodes: bridge,
        plConnector: { name: 'Brad Holden' },
        investorNode: investor,
        hops: 2,
      });
      expect(nodes.map((n) => n.label)).toEqual(['Brad Holden', 'CoinList', 'Rauno Miljand']);
    });

    it('case 3 prepends PL org when no connector', () => {
      const nodes = buildFullRouteNodes({
        bridgeNodes: bridge,
        plConnector: null,
        investorNode: investor,
        hops: 2,
      });
      expect(nodes[0]).toEqual(PROTOCOL_LABS_ORG_NODE);
    });

    it('prepends PL org for founder bridge without PL connector (including hops 1)', () => {
      const nodes = buildFullRouteNodes({
        bridgeNodes: [{ label: 'Jonathan King', variant: 'member' }],
        plConnector: null,
        investorNode: investor,
        hops: 1,
      });
      expect(nodes.map((n) => n.label)).toEqual(['Protocol Labs', 'Jonathan King', 'Rauno Miljand']);
    });

    it('case 1 strips duplicate connector from legacy bridge fields', () => {
      const nodes = buildFullRouteNodes({
        bridgeNodes: [{ label: 'Brad Holden', variant: 'external' }],
        plConnector: { name: 'Brad Holden' },
        investorNode: investor,
        hops: 1,
      });
      expect(nodes.map((n) => n.label)).toEqual(['Brad Holden', 'Rauno Miljand']);
    });

    it('strips founder bridge that matches investor by name (no PL org fallback)', () => {
      const sam = buildInvestorRouteNode({ firstName: 'Sam', lastName: 'Altman' });
      const nodes = buildFullRouteNodes({
        bridgeNodes: [{ label: 'Sam Altman', variant: 'external' }],
        plConnector: null,
        investorNode: sam,
        hops: 1,
      });
      expect(nodes.map((n) => n.label)).toEqual(['Sam Altman']);
    });

    it('strips founder bridge that matches investor by memberUid', () => {
      const sam = buildInvestorRouteNode({
        firstName: 'Sam',
        lastName: 'Altman',
        memberUid: 'uid-sam',
      });
      const nodes = buildFullRouteNodes({
        bridgeNodes: [{ label: 'S. Altman', variant: 'member', memberUid: 'uid-sam' }],
        plConnector: null,
        investorNode: sam,
        hops: 1,
      });
      expect(nodes.map((n) => n.label)).toEqual(['Sam Altman']);
      expect(nodes[0].memberUid).toBe('uid-sam');
    });

    it('keeps PL connector when bridge person equals investor', () => {
      const russell = buildInvestorRouteNode({ firstName: 'Russell', lastName: 'Glass' });
      const nodes = buildFullRouteNodes({
        bridgeNodes: [{ label: 'Russell Glass', variant: 'external' }],
        plConnector: { name: 'Brad Holden' },
        investorNode: russell,
        hops: 1,
      });
      expect(nodes.map((n) => n.label)).toEqual(['Brad Holden', 'Russell Glass']);
    });
  });

  describe('finalizePersonHopChain', () => {
    it('composes 3-node case-2 chain from dump-shaped hopChain', () => {
      const out = finalizePersonHopChain(
        {
          routeNodes: [PROTOCOL_LABS_ORG_NODE, { label: 'Jane Founder', variant: 'external' }],
          plConnector: { name: 'Lacey Wisdom' },
          contact: { name: 'Jane Founder', role: 'Founder' },
          hops: 2,
        },
        { firstName: 'Sebastian', lastName: 'Zhou' },
        undefined,
        2
      );
      const routeNodes = (out.routeNodes as Array<{ label: string }>).map((n) => n.label);
      expect(routeNodes).toEqual(['Lacey Wisdom', 'Jane Founder', 'Sebastian Zhou']);
    });

    it('case 1 affinity-direct yields single PL connector node', () => {
      const out = finalizePersonHopChain(
        {
          plConnector: { name: 'Brad Holden' },
          contact: { name: 'Brad Holden', role: 'Protocol Labs' },
          routeNodes: [{ label: 'Brad Holden', variant: 'external' }],
          hops: 1,
        },
        { firstName: 'Fred', lastName: 'Wilson' },
        undefined,
        1
      );
      const routeNodes = (out.routeNodes as Array<{ label: string; memberUid?: string }>).map((n) => ({
        label: n.label,
        memberUid: n.memberUid,
      }));
      expect(routeNodes).toEqual([{ label: 'Brad Holden' }, { label: 'Fred Wilson' }]);
    });

    it('founder=investor collapses to a single person hop (no Sam → Sam)', () => {
      const out = finalizePersonHopChain(
        {
          routeNodes: [PROTOCOL_LABS_ORG_NODE, { label: 'Sam Altman', variant: 'external' }],
          contact: { name: 'Sam Altman', role: 'Founder' },
          hops: 1,
        },
        { firstName: 'Sam', lastName: 'Altman' },
        undefined,
        1
      );
      const routeNodes = (out.routeNodes as Array<{ label: string }>).map((n) => n.label);
      expect(routeNodes).toEqual(['Sam Altman']);
    });

    it('case 1 affinity-direct ignores firm-grain Investor placeholder in nodes', () => {
      const out = finalizePersonHopChain(
        {
          plConnector: { name: 'Brad Holden' },
          nodes: [
            { id: 'PL', label: 'Protocol Labs', type: 'org' },
            { id: '118572137', label: 'Investor', type: 'person' },
          ],
          hops: 1,
        },
        { firstName: 'Ciarán', lastName: "O'Leary" },
        {
          portfolioTeams: new Map(),
          membersByName: new Map([['brad holden', 'uid-brad']]),
        },
        1
      );
      const labels = (out.routeNodes as Array<{ label: string }>).map((n) => n.label);
      expect(labels).toEqual(['Brad Holden', "Ciarán O'Leary"]);
    });

    it('resolves memberUid on PL connector from LabOS index', () => {
      const out = finalizePersonHopChain(
        { plConnector: { name: 'Brad Holden' }, hops: 1 },
        { firstName: 'Fred', lastName: 'Wilson' },
        {
          portfolioTeams: new Map(),
          membersByName: new Map([['brad holden', 'uid-brad']]),
        },
        1
      );
      expect(out.routeNodes).toEqual([
        { label: 'Brad Holden', memberUid: 'uid-brad', variant: 'member' },
        { label: 'Fred Wilson', variant: 'external' },
      ]);
    });

    it('VC org bridge uses person-primary route from orgConnectors', () => {
      const out = finalizePersonHopChain(
        {
          orgConnectors: [
            {
              name: 'Coinbase',
              description: 'co-invested',
              tags: ['Org connection'],
              contacts: [
                {
                  name: 'Jonathan King',
                  email: 'jonathan.king@coinbase.com',
                  role: 'Principal',
                  source: 'gold_list',
                },
              ],
            },
          ],
          routeNodes: [
            {
              label: 'Jonathan King',
              orgName: 'Coinbase',
              variant: 'external',
              contacts: [
                {
                  name: 'Jonathan King',
                  email: 'jonathan.king@coinbase.com',
                  source: 'gold_list',
                },
              ],
            },
          ],
          plConnector: { name: 'Brad Holden' },
          hops: 2,
        },
        { firstName: 'Jacqueline', lastName: 'Kwok' },
        { portfolioTeams: new Map(), membersByName: new Map([['brad holden', 'uid-brad']]) },
        2,
        {
          byEmail: new Map([['jonathan.king@coinbase.com', { uid: 'uid-jk', imageUrl: 'https://img/jk.webp' }]]),
          byUid: new Map([['uid-jk', { uid: 'uid-jk', imageUrl: 'https://img/jk.webp' }]]),
          membersByName: new Map(),
        }
      );
      const routeNodes = out.routeNodes as Array<{ label: string; orgName?: string; memberUid?: string }>;
      expect(routeNodes.map((n) => n.label)).toEqual(['Brad Holden', 'Jonathan King', 'Jacqueline Kwok']);
      expect(routeNodes[1].orgName).toBe('Coinbase');
      expect(routeNodes[1].memberUid).toBe('uid-jk');
    });

    it('VC+3 keeps all intermediary routeNodes (does not collapse via contact)', () => {
      const out = finalizePersonHopChain(
        {
          contact: { name: 'Wei Dai', role: 'Contact', email: 'w@1kx.capital' },
          orgConnectors: [
            {
              name: '1kx',
              description: 'co-invested',
              tags: ['Org connection'],
              contacts: [{ name: 'Wei Dai', email: 'w@1kx.capital', role: 'Contact', source: 'gold_list' }],
            },
            {
              name: 'A* Capital',
              description: 'co-invested',
              tags: ['Org connection', 'Person unknown'],
              contacts: [],
            },
          ],
          routeNodes: [
            {
              label: 'Wei Dai',
              orgName: '1kx',
              variant: 'external',
              contacts: [{ name: 'Wei Dai', email: 'w@1kx.capital', source: 'gold_list' }],
            },
            { label: 'A* Capital', variant: 'org' },
          ],
          plConnector: { name: 'Brad Holden' },
          hops: 3,
        },
        { firstName: 'Eugene', lastName: 'Chang' },
        { portfolioTeams: new Map(), membersByName: new Map([['brad holden', 'uid-brad']]) },
        3
      );
      const routeNodes = out.routeNodes as Array<{ label: string; orgName?: string; variant?: string }>;
      expect(routeNodes.map((n) => n.label)).toEqual(['Brad Holden', 'Wei Dai', 'A* Capital', 'Eugene Chang']);
      expect(routeNodes[1].orgName).toBe('1kx');
      expect(routeNodes[2].variant).toBe('org');
    });

    it('VC+3 builds multi-bridge from orgConnectors when routeNodes absent', () => {
      const out = finalizePersonHopChain(
        {
          contact: { name: 'Wei Dai', role: 'Contact', email: 'w@1kx.capital' },
          orgConnectors: [
            {
              name: '1kx',
              description: 'co-invested',
              tags: ['Org connection'],
              contacts: [{ name: 'Wei Dai', email: 'w@1kx.capital', role: 'Contact', source: 'gold_list' }],
            },
            {
              name: 'A* Capital',
              description: 'co-invested',
              tags: ['Org connection', 'Person unknown'],
              contacts: [],
            },
          ],
          plConnector: { name: 'Brad Holden' },
          hops: 3,
        },
        { firstName: 'Eugene', lastName: 'Chang' },
        { portfolioTeams: new Map(), membersByName: new Map([['brad holden', 'uid-brad']]) },
        3
      );
      const labels = (out.routeNodes as Array<{ label: string }>).map((n) => n.label);
      expect(labels).toEqual(['Brad Holden', 'Wei Dai', 'A* Capital', 'Eugene Chang']);
    });

    it('VC org bridge resolves orgConnector.teamUid from Directory team index', () => {
      const out = finalizePersonHopChain(
        {
          orgConnectors: [
            {
              name: 'Coinbase',
              description: 'co-invested',
              tags: ['Org connection'],
              website: 'coinbase.com',
              contacts: [
                {
                  name: 'Jonathan King',
                  email: 'jonathan.king@coinbase.com',
                  role: 'Principal',
                  source: 'gold_list',
                },
              ],
            },
          ],
          plConnector: { name: 'Brad Holden' },
          hops: 2,
        },
        { firstName: 'Jacqueline', lastName: 'Kwok' },
        { portfolioTeams: new Map(), membersByName: new Map([['brad holden', 'uid-brad']]) },
        2,
        {
          byEmail: new Map([['jonathan.king@coinbase.com', { uid: 'uid-jk', imageUrl: 'https://img/jk.webp' }]]),
          byUid: new Map([['uid-jk', { uid: 'uid-jk', imageUrl: 'https://img/jk.webp' }]]),
          membersByName: new Map(),
        },
        teamIndexForCoinbase()
      );
      const orgConnector = out.orgConnector as { teamUid?: string; logo?: string };
      expect(orgConnector.teamUid).toBe('uid-coinbase');
      expect(orgConnector.logo).toBe('https://img/cb.png');
      const bridge = (out.routeNodes as Array<{ teamUid?: string }>)[1];
      expect(bridge?.teamUid).toBe('uid-coinbase');
    });

    it('F+2 misresolved dump uses f_* founder broker in routeNodes', () => {
      const out = finalizePersonHopChain(
        {
          nodes: [
            { id: 'PL', label: 'Protocol Labs', type: 'org' },
            { id: 'f_andrew_milich', label: 'Andrew Milich', type: 'org' },
            { id: 'lp_sequoia_capital', label: 'Sequoia Capital', type: 'org' },
          ],
          edges: [
            {
              from: 'f_andrew_milich',
              to: 'lp_sequoia_capital',
              evidence: 'co-invested via Sequoia Capital',
            },
          ],
          contact: { name: 'Sequoia Capital', role: 'investor in Skiff' },
          connectorTeam: {
            name: 'Sequoia Capital',
            leads: [
              { name: 'Sequoia Capital', role: 'investor in Skiff' },
              { name: 'Roelof Botha', role: 'LP @ Sequoia Capital (co-invested Skiff)' },
            ],
          },
          routeNodes: [
            { label: 'Protocol Labs', variant: 'org' },
            { label: 'Sequoia Capital', variant: 'external' },
          ],
          plConnector: { name: 'Lacey Wisdom' },
          hops: 2,
        },
        { firstName: 'Roelof', lastName: 'Botha' },
        undefined,
        2
      );
      const routeNodes = out.routeNodes as Array<{ label: string; orgName?: string }>;
      expect(routeNodes.map((n) => n.label)).toEqual(['Lacey Wisdom', 'Andrew Milich', 'Roelof Botha']);
      expect(routeNodes[1].orgName).toBe('Sequoia Capital');
      expect((out.contact as { name: string }).name).toBe('Andrew Milich');
    });
  });
});
