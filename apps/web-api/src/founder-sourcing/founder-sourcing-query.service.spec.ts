import { FounderSourcingQueryService } from './founder-sourcing-query.service';
import { PrismaService } from '../shared/prisma.service';
import { parseSourceList } from './founder-sourcing.vocab';

describe('parseSourceList', () => {
  it('returns empty array for undefined or blank input', () => {
    expect(parseSourceList()).toEqual([]);
    expect(parseSourceList('')).toEqual([]);
    expect(parseSourceList('  ')).toEqual([]);
  });

  it('splits comma-separated values and trims whitespace', () => {
    expect(parseSourceList('LinkedIn, Twitter')).toEqual(['LinkedIn', 'Twitter']);
    expect(parseSourceList(' github-events , crunchbase ')).toEqual(['github-events', 'crunchbase']);
  });

  it('drops empty segments', () => {
    expect(parseSourceList('LinkedIn,,Twitter,')).toEqual(['LinkedIn', 'Twitter']);
  });
});

describe('FounderSourcingQueryService', () => {
  let service: FounderSourcingQueryService;
  const count = jest.fn();
  const findMany = jest.fn();
  const queryRaw = jest.fn();
  const transaction = jest.fn();

  const prismaMock = {
    founderSourcingRecord: {
      count,
      findMany,
    },
    $queryRaw: queryRaw,
    $transaction: transaction,
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FounderSourcingQueryService(prismaMock);
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);
    transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  });

  describe('getFilterOptions', () => {
    it('returns distinct sources from raw query', async () => {
      queryRaw.mockResolvedValue([{ val: 'github-events' }, { val: 'LinkedIn' }]);

      const result = await service.getFilterOptions();

      expect(result).toEqual({ sources: ['github-events', 'LinkedIn'] });
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('listFounders source filter', () => {
    it('filters by founderIds from case-insensitive source match', async () => {
      queryRaw.mockResolvedValue([{ founderId: 'profile-001' }]);

      await service.listFounders({ source: 'github-events' });

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(count).toHaveBeenCalledWith({
        where: { founderId: { in: ['profile-001'] } },
      });
    });

    it('OR-combines multiple selected sources', async () => {
      queryRaw.mockResolvedValue([{ founderId: 'profile-001' }, { founderId: 'profile-002' }]);

      await service.listFounders({ source: 'LinkedIn,Twitter' });

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(count).toHaveBeenCalledWith({
        where: { founderId: { in: ['profile-001', 'profile-002'] } },
      });
    });

    it('returns no results when no founderIds match', async () => {
      queryRaw.mockResolvedValue([]);

      await service.listFounders({ source: 'LinkedIn,Twitter' });

      expect(count).toHaveBeenCalledWith({
        where: { founderId: { in: [] } },
      });
    });

    it('does not apply source filter when source param is empty', async () => {
      await service.listFounders({});

      expect(queryRaw).not.toHaveBeenCalled();
      expect(count).toHaveBeenCalledWith({ where: {} });
    });
  });
});
