import {
  buildFullRouteNodes,
  buildInvestorRouteNode,
  finalizePersonHopChain,
  PROTOCOL_LABS_ORG_NODE,
} from './path-route.util';

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

    it('case 1 strips duplicate connector from legacy bridge fields', () => {
      const nodes = buildFullRouteNodes({
        bridgeNodes: [{ label: 'Brad Holden', variant: 'external' }],
        plConnector: { name: 'Brad Holden' },
        investorNode: investor,
        hops: 1,
      });
      expect(nodes.map((n) => n.label)).toEqual(['Brad Holden', 'Rauno Miljand']);
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
          membersByName: new Map(),
        }
      );
      const routeNodes = out.routeNodes as Array<{ label: string; orgName?: string; memberUid?: string }>;
      expect(routeNodes.map((n) => n.label)).toEqual(['Brad Holden', 'Jonathan King', 'Jacqueline Kwok']);
      expect(routeNodes[1].orgName).toBe('Coinbase');
      expect(routeNodes[1].memberUid).toBe('uid-jk');
    });
  });
});
