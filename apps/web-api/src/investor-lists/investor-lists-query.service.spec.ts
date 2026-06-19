import { InvestorListsQueryService } from './investor-lists-query.service';
import { PrismaService } from '../shared/prisma.service';

describe('InvestorListsQueryService', () => {
  let service: InvestorListsQueryService;

  const investorListFindMany = jest.fn();
  const investorOutreachRecordFindUnique = jest.fn();
  const investorListMembershipFindMany = jest.fn();

  const prismaMock = {
    investorList: { findMany: investorListFindMany },
    investorOutreachRecord: { findUnique: investorOutreachRecordFindUnique },
    investorListMembership: { findMany: investorListMembershipFindMany },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
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
});
