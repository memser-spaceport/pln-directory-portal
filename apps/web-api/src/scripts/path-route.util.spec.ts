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
  });
});
