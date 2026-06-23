import { parseRouteNodesFromHopChain, routeNodeToHopNodeDto } from './route-node-display.util';
import { RouteNodeContact } from './dto/ingest-pathfinder.dto';

describe('route-node-display.util', () => {
  describe('routeNodeToHopNodeDto', () => {
    it('maps member variant to person with memberUid', () => {
      expect(routeNodeToHopNodeDto({ label: 'Jane', variant: 'member', memberUid: 'uid-1' }, 0)).toEqual({
        id: 'route-0',
        label: 'Jane',
        type: 'person',
        memberUid: 'uid-1',
      });
    });

    it('maps external variant to person without memberUid', () => {
      expect(routeNodeToHopNodeDto({ label: 'Elad Gil', variant: 'external' }, 1)).toEqual({
        id: 'route-1',
        label: 'Elad Gil',
        type: 'person',
      });
    });

    it('maps org with teamUid', () => {
      expect(routeNodeToHopNodeDto({ label: 'Modular', variant: 'org', teamUid: 'team-1' }, 0)).toEqual({
        id: 'route-0',
        label: 'Modular',
        type: 'org',
        teamUid: 'team-1',
      });
    });

    it('maps org without teamUid', () => {
      expect(routeNodeToHopNodeDto({ label: 'Coatue', variant: 'org' }, 0)).toEqual({
        id: 'route-0',
        label: 'Coatue',
        type: 'org',
      });
    });
  });

  describe('parseRouteNodesFromHopChain', () => {
    it('reads hopChain.routeNodes when present', () => {
      const nodes = parseRouteNodesFromHopChain({
        routeNodes: [
          { label: 'Coatue', variant: 'org' },
          { label: 'Elad Gil', variant: 'external' },
        ],
      });
      expect(nodes).toHaveLength(2);
      expect(nodes[0]).toMatchObject({ label: 'Coatue', type: 'org' });
      expect(nodes[1]).toMatchObject({ label: 'Elad Gil', type: 'person' });
    });

    it('falls back to legacy nodes and strips Protocol Labs', () => {
      const nodes = parseRouteNodesFromHopChain({
        nodes: [
          { id: 'PL', label: 'Protocol Labs', type: 'org' },
          { id: 'gold_coatue', label: 'Coatue', type: 'org' },
          { id: 'lp_aff_elad', label: 'Elad Gil', type: 'org' },
        ],
      });
      expect(nodes.map((n) => n.label)).toEqual(['Coatue', 'Elad Gil']);
      expect(nodes.every((n) => n.label !== 'Protocol Labs')).toBe(true);
    });

    it('returns empty for invalid input', () => {
      expect(parseRouteNodesFromHopChain(null)).toEqual([]);
      expect(parseRouteNodesFromHopChain({})).toEqual([]);
    });

    it('reads 3-node case-2 chain (PL connector → bridge → investor)', () => {
      const nodes = parseRouteNodesFromHopChain({
        routeNodes: [
          { label: 'Brad Holden', variant: 'external' },
          { label: 'Jane Founder', variant: 'external' },
          { label: 'Rauno Miljand', variant: 'external' },
        ],
      });
      expect(nodes).toHaveLength(3);
      expect(nodes.map((n) => n.label)).toEqual(['Brad Holden', 'Jane Founder', 'Rauno Miljand']);
      expect(nodes[0].type).toBe('person');
      expect(nodes[2].type).toBe('person');
    });

    it('drops firm-grain Investor placeholder from stored routeNodes', () => {
      const nodes = parseRouteNodesFromHopChain({
        routeNodes: [
          { label: 'Brad Holden', variant: 'member', memberUid: 'uid-brad' },
          { label: 'Investor', variant: 'external' },
          { label: "Ciarán O'Leary", variant: 'external' },
        ],
      });
      expect(nodes.map((n) => n.label)).toEqual(['Brad Holden', "Ciarán O'Leary"]);
    });

    it('maps person-primary org bridge with contacts', () => {
      const contacts: RouteNodeContact[] = [
        {
          name: 'Jonathan King',
          email: 'jonathan.king@coinbase.com',
          memberUid: 'uid-jk',
          imageUrl: 'https://img/jk.webp',
          source: 'gold_list',
        },
      ];
      const nodes = parseRouteNodesFromHopChain({
        routeNodes: [
          { label: 'Brad Holden', variant: 'member', memberUid: 'uid-brad' },
          {
            label: 'Jonathan King',
            orgName: 'Coinbase',
            variant: 'member',
            memberUid: 'uid-jk',
            contacts,
          },
          { label: 'Jacqueline Kwok', variant: 'external' },
        ],
      });
      expect(nodes[1]).toMatchObject({
        label: 'Jonathan King',
        type: 'person',
        orgName: 'Coinbase',
        memberUid: 'uid-jk',
        imageUrl: 'https://img/jk.webp',
        email: 'jonathan.king@coinbase.com',
        contacts,
      });
    });
  });
});
