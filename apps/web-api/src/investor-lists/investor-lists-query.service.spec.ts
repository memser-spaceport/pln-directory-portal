import { BadRequestException } from '@nestjs/common';
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
  const queryRaw = jest.fn();

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
    $queryRaw: queryRaw,
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

    it('filters members to direct-only PL paths', async () => {
      queryRaw.mockResolvedValueOnce([{ targetInvestorId: '101' }, { targetInvestorId: '102' }]);
      investorOutreachRecordCount.mockResolvedValue(0);
      investorOutreachRecordFindMany.mockResolvedValue([]);

      await service.listMembers(1, { directOnly: 'true' });

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(investorOutreachRecordFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                investorId: { in: ['101', '102'] },
              }),
            ]),
          }),
        })
      );
    });

    it('intersects connector lens and path-via filters', async () => {
      queryRaw
        .mockResolvedValueOnce([{ targetInvestorId: '101' }, { targetInvestorId: '102' }])
        .mockResolvedValueOnce([{ targetInvestorId: '102' }, { targetInvestorId: '103' }]);
      investorOutreachRecordCount.mockResolvedValue(0);
      investorOutreachRecordFindMany.mockResolvedValue([]);

      await service.listMembers(1, {
        connectorLabels: 'Brad Holden',
        plMembers: 'Brad Holden',
      });

      expect(queryRaw).toHaveBeenCalledTimes(2);
      expect(investorOutreachRecordFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                investorId: { in: ['102'] },
              }),
            ]),
          }),
        })
      );
    });

    it('extends q with founder path keyword matches', async () => {
      investorOutreachRecordFindMany.mockResolvedValueOnce([{ investorId: '201' }]).mockResolvedValueOnce([]);
      queryRaw.mockResolvedValueOnce([{ targetInvestorId: '201' }]);
      investorOutreachRecordCount.mockResolvedValue(0);

      await service.listMembers(1, { q: 'Modular Globe' });

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(investorOutreachRecordFindMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({
                    investorId: { in: ['201'] },
                  }),
                ]),
              }),
            ]),
          }),
        })
      );
    });

    it('rejects too many plMembers values', async () => {
      const plMembers = Array.from({ length: 21 }, (_, i) => `member-${i}`).join(',');
      await expect(service.listMembers(1, { plMembers })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listWarmIntroFacets', () => {
    it('returns empty facets for non-graphed lists', async () => {
      investorListFindUnique.mockResolvedValue({
        id: 1,
        isGraphed: false,
        targetSet: 'unused',
      });

      const result = await service.listWarmIntroFacets(1);

      expect(result).toEqual({ plMembers: [], founders: [] });
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('returns PL member and founder facet rows for graphed lists', async () => {
      investorListFindUnique.mockResolvedValue({
        id: 1,
        isGraphed: true,
        targetSet: 'neuro-fund-i',
      });
      queryRaw
        .mockResolvedValueOnce([{ name: 'brad holden', member_uid: 'brad-holden', cnt: 12 }])
        .mockResolvedValueOnce([
          {
            facet_key: 'alicia mer',
            name: 'Alicia Mer',
            member_uid: 'alicia-mer',
            role: 'CEO',
            teams: [{ name: 'Modular Globe', teamUid: 'modular-globe' }],
            cnt: 8,
          },
        ]);

      const result = await service.listWarmIntroFacets(1);

      expect(result.plMembers).toEqual([{ name: 'Brad Holden', memberUid: 'brad-holden', count: 12 }]);
      expect(result.founders).toEqual([
        {
          name: 'Alicia Mer',
          memberUid: 'alicia-mer',
          role: 'CEO',
          teams: [{ name: 'Modular Globe', teamUid: 'modular-globe' }],
          count: 8,
        },
      ]);
      expect(queryRaw).toHaveBeenCalledTimes(2);
    });
  });
});
