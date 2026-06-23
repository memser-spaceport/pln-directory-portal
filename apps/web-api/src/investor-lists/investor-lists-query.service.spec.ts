import { InvestorListsQueryService } from './investor-lists-query.service';
import { PrismaService } from '../shared/prisma.service';

describe('InvestorListsQueryService', () => {
  let service: InvestorListsQueryService;

  const investorListFindMany = jest.fn();
  const investorListFindUnique = jest.fn();
  const investorOutreachRecordFindUnique = jest.fn();
  const investorListMembershipFindMany = jest.fn();
  const investorOutreachRecordCount = jest.fn();
  const investorOutreachRecordFindMany = jest.fn();
  const pathfinderPathFindMany = jest.fn();
  const pathfinderPathGroupBy = jest.fn();
  const memberFindMany = jest.fn();
  const investorPortfolioOverlapFindMany = jest.fn();

  const prismaMock = {
    investorList: { findMany: investorListFindMany, findUnique: investorListFindUnique },
    investorOutreachRecord: {
      findUnique: investorOutreachRecordFindUnique,
      count: investorOutreachRecordCount,
      findMany: investorOutreachRecordFindMany,
    },
    investorListMembership: { findMany: investorListMembershipFindMany },
    pathfinderPath: { findMany: pathfinderPathFindMany, groupBy: pathfinderPathGroupBy },
    member: { findMany: memberFindMany },
    investorPortfolioOverlap: { findMany: investorPortfolioOverlapFindMany },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    memberFindMany.mockResolvedValue([]);
    investorPortfolioOverlapFindMany.mockResolvedValue([]);
    pathfinderPathGroupBy.mockResolvedValue([]);
    service = new InvestorListsQueryService(prismaMock);
  });

  describe('listLists', () => {
    const lists = [
      {
        id: 1,
        slug: 'neuro-lp',
        name: 'Neuro Fund I LP Pipeline',
        description: null,
        isGraphed: true,
        _count: { memberships: 10 },
      },
      {
        id: 2,
        slug: 'gold-coinvestors',
        name: 'Gold PLC Co-Investors',
        description: null,
        isGraphed: true,
        _count: { memberships: 5 },
      },
    ];

    it('returns lists without isMember when investorId is omitted', async () => {
      investorListFindMany.mockResolvedValue(lists);

      const result = await service.listLists();

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        id: 1,
        slug: 'neuro-lp',
        name: 'Neuro Fund I LP Pipeline',
        description: null,
        isGraphed: true,
        memberCount: 10,
      });
      expect(result.items[0]).not.toHaveProperty('isMember');
      expect(investorOutreachRecordFindUnique).not.toHaveBeenCalled();
    });

    it('returns isMember true only for lists the investor belongs to', async () => {
      investorListFindMany.mockResolvedValue(lists);
      investorOutreachRecordFindUnique.mockResolvedValue({ id: 99 });
      investorListMembershipFindMany.mockResolvedValue([{ listId: 1 }]);

      const result = await service.listLists('inv-123');

      expect(investorOutreachRecordFindUnique).toHaveBeenCalledWith({
        where: { investorId: 'inv-123' },
        select: { id: true },
      });
      expect(result.items[0].isMember).toBe(true);
      expect(result.items[1].isMember).toBe(false);
    });

    it('returns isMember false for all lists when investor is unknown', async () => {
      investorListFindMany.mockResolvedValue(lists);
      investorOutreachRecordFindUnique.mockResolvedValue(null);

      const result = await service.listLists('unknown-inv');

      expect(investorListMembershipFindMany).not.toHaveBeenCalled();
      expect(result.items.every((item) => item.isMember === false)).toBe(true);
    });
  });

  describe('listMembers (graphed list sort — Task 07)', () => {
    const graphedList = {
      id: 1,
      slug: 'neuro-lp',
      isGraphed: true,
      targetSet: 'neuro-fund-i',
    };

    const record = (investorId: string, lastName: string, bestProximityCode: string | null, hasPath: boolean) => ({
      id: Number(investorId),
      investorId,
      canonicalId: investorId,
      dedupeKey: `aff-${investorId}`,
      firstName: 'Test',
      lastName,
      email: `${investorId}@lp.local`,
      emailStatus: 'unverified',
      firm: 'Firm',
      title: null,
      investorType: 'fund',
      stageFocus: '',
      checkSizeRange: null,
      sectorTags: '',
      geoFocus: null,
      engagementTier: '',
      source: 'PATHFINDER_NEURO',
      bestProximityCode,
      hasPath,
      enrichmentStatus: 'pending',
      rawPayload: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    beforeEach(() => {
      investorListFindUnique.mockResolvedValue(graphedList);
      investorOutreachRecordCount.mockResolvedValue(2);
    });

    it('sorts direct 1-hop members before warmer 2-hop members', async () => {
      const direct = record('101', 'Alpha', 'F+1B', true);
      const multiHop = record('102', 'Beta', 'VC+2A', true);
      investorOutreachRecordFindMany.mockResolvedValue([multiHop, direct]);
      pathfinderPathFindMany.mockResolvedValue([
        { targetInvestorId: '101', proximityCode: 'F+1B', hops: 1, score: 0.25 },
        { targetInvestorId: '102', proximityCode: 'VC+2A', hops: 2, score: 0.85 },
      ]);

      const result = await service.listMembers(1, {});

      expect(result.items).toHaveLength(2);
      expect(result.items[0].investorId).toBe('101');
      expect(result.items[1].investorId).toBe('102');
    });

    it('attaches bestRouteNodes, bestRouteScore, and pathCount for page members', async () => {
      const warm = record('118282344', 'Gil', 'VC+2A', true);
      investorOutreachRecordFindMany.mockResolvedValue([warm]);
      pathfinderPathFindMany
        .mockResolvedValueOnce([{ targetInvestorId: '118282344', proximityCode: 'VC+2A', hops: 2, score: 0.146 }])
        .mockResolvedValueOnce([
          {
            targetInvestorId: '118282344',
            score: 0.146,
            hopChain: {
              routeNodes: [
                { label: 'Coatue', variant: 'org' },
                { label: 'Elad Gil', variant: 'external' },
              ],
            },
          },
        ]);
      pathfinderPathGroupBy.mockResolvedValue([{ targetInvestorId: '118282344', _count: { _all: 5 } }]);

      const result = await service.listMembers(1, { limit: '10' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].bestRouteScore).toBe(0.146);
      expect(result.items[0].pathCount).toBe(5);
      expect(result.items[0].bestRouteNodes).toEqual([
        { id: 'route-0', label: 'Coatue', type: 'org' },
        { id: 'route-1', label: 'Elad Gil', type: 'person' },
      ]);
    });
  });
});
