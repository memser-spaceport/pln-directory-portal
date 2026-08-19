import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MasterProfileService } from './master-profile.service';
import { PrismaService } from '../shared/prisma.service';

function rawSqlValues(call: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const arg of call) {
    if (arg && typeof arg === 'object' && Array.isArray((arg as Prisma.Sql).values)) {
      out.push(...rawSqlValues((arg as Prisma.Sql).values));
    } else if (typeof arg !== 'object' || arg === null) {
      out.push(arg);
    }
  }
  return out;
}

describe('MasterProfileService', () => {
  let service: MasterProfileService;
  const findUnique = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const findFirst = jest.fn();
  const findMany = jest.fn();
  const queryRaw = jest.fn();
  const transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      masterProfile: { findUnique, create, update },
    })
  );

  const prismaMock = {
    $transaction: transaction,
    $queryRaw: queryRaw,
    masterProfile: { findUnique, findFirst, findMany, create, update },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MasterProfileService(prismaMock);
  });

  describe('ingest', () => {
    it('rejects empty personKey / canonicalName (whole batch)', async () => {
      await expect(
        service.ingest({
          profiles: [{ personKey: '', types: ['investor'], canonicalName: 'Ada' }],
        })
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.ingest({
          profiles: [{ personKey: 'k1', types: [], canonicalName: '  ' }],
        })
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction).not.toHaveBeenCalled();
    });

    it('creates then updates by personKey and returns counts', async () => {
      findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ uid: 'u1' });
      create.mockResolvedValue({ uid: 'u1' });
      update.mockResolvedValue({ uid: 'u1' });

      const result = await service.ingest({
        runId: 'run-1',
        profiles: [
          {
            personKey: ' affinity:1 ',
            types: ['investor'],
            canonicalName: 'Ada',
            emails: [{ value: 'a@b.com', sources: [{ type: 'affinity' }] }],
          },
          {
            personKey: 'affinity:1',
            types: ['investor', 'founder'],
            canonicalName: 'Ada Lovelace',
            currentOrg: 'PL',
          },
        ],
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          personKey: 'affinity:1',
          canonicalName: 'Ada',
          types: ['investor'],
          emails: [{ value: 'a@b.com', sources: [{ type: 'affinity' }] }],
        }),
      });
      expect(update).toHaveBeenCalledWith({
        where: { personKey: 'affinity:1' },
        data: expect.objectContaining({
          canonicalName: 'Ada Lovelace',
          types: ['investor', 'founder'],
          currentOrg: 'PL',
          emails: Prisma.DbNull,
        }),
      });
      expect(result).toEqual({
        runId: 'run-1',
        received: 2,
        upserted: 2,
        created: 1,
        updated: 1,
      });
    });
  });

  describe('lookup', () => {
    it('returns single profile for personKey', async () => {
      findUnique.mockResolvedValue({ uid: 'u1', personKey: 'k1', types: ['investor'] });
      await expect(service.lookup({ personKey: 'k1' })).resolves.toEqual({
        profile: { uid: 'u1', personKey: 'k1', types: ['investor'] },
      });
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('lists by type with limit and offset', async () => {
      queryRaw.mockResolvedValue([{ uid: 'u1' }]);
      await expect(service.lookup({ type: 'pl_internal', limit: '5', offset: '10' })).resolves.toEqual({
        profiles: [{ uid: 'u1' }],
        limit: 5,
        offset: 10,
      });
      expect(findMany).not.toHaveBeenCalled();
      expect(rawSqlValues(queryRaw.mock.calls[0])).toEqual(expect.arrayContaining(['pl_internal', 5, 10]));
    });

    it('ANDs name, email, org, and type on the list branch', async () => {
      queryRaw.mockResolvedValue([]);
      await expect(
        service.lookup({ name: 'Jane', email: 'jane@a16z.com', currentOrg: 'a16z', type: 'investor' })
      ).resolves.toEqual({ profiles: [], limit: 20, offset: 0 });
      expect(findUnique).not.toHaveBeenCalled();
      expect(rawSqlValues(queryRaw.mock.calls[0])).toEqual(
        expect.arrayContaining(['%Jane%', '%jane@a16z.com%', '%a16z%', 'investor', 20, 0])
      );
    });

    it('does not 404 when the list is empty', async () => {
      queryRaw.mockResolvedValue([]);
      await expect(service.lookup({ name: 'nobody' })).resolves.toEqual({
        profiles: [],
        limit: 20,
        offset: 0,
      });
    });
  });

  describe('getByUid', () => {
    it('throws a clear not-found error', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.getByUid('missing')).rejects.toEqual(
        new NotFoundException('MasterProfile not found: missing')
      );
    });
  });

  describe('lookupBatch', () => {
    it('finds by personKeys / affinityPersonIds', async () => {
      findMany.mockResolvedValue([{ uid: 'u1', personKey: 'k1' }]);
      await expect(service.lookupBatch({ personKeys: ['k1'], affinityPersonIds: ['99'] })).resolves.toEqual({
        profiles: [{ uid: 'u1', personKey: 'k1' }],
      });
      expect(findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ personKey: { in: ['k1'] } }, { affinityPersonId: { in: ['99'] } }],
        },
        orderBy: { personKey: 'asc' },
      });
    });
  });
});
