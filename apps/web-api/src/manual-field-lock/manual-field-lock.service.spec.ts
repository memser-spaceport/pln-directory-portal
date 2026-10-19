import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ManualFieldLockService } from './manual-field-lock.service';
import { PrismaService } from '../shared/prisma.service';

function errorBody(error: unknown): unknown {
  return (error as BadRequestException).getResponse();
}

describe('ManualFieldLockService', () => {
  const profileFindUnique = jest.fn();
  const profileUpdate = jest.fn();
  const edgeFindUnique = jest.fn();
  const edgeUpdate = jest.fn();
  const pathFindUnique = jest.fn();
  const pathUpdate = jest.fn();
  const lockFindMany = jest.fn();
  const lockUpsert = jest.fn();
  const lockDeleteMany = jest.fn();

  const tx = {
    masterProfile: { findUnique: profileFindUnique, update: profileUpdate },
    connectionEdge: { findUnique: edgeFindUnique, update: edgeUpdate },
    warmPathV2: { findUnique: pathFindUnique, update: pathUpdate },
    manualFieldLock: { findMany: lockFindMany, upsert: lockUpsert, deleteMany: lockDeleteMany },
  };
  const transaction = jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  const service = new ManualFieldLockService(prisma);
  const actor = { source: 'mcp' as const, actorUid: ' m1 ', actorEmail: ' ada@example.com ' };

  beforeEach(() => {
    jest.clearAllMocks();
    profileFindUnique.mockResolvedValue({ uid: 'u1', bio: 'old' });
    profileUpdate.mockResolvedValue({ uid: 'u1' });
    edgeFindUnique.mockResolvedValue({ uid: 'e1' });
    pathFindUnique.mockResolvedValue({ uid: 'p1' });
    lockUpsert.mockResolvedValue({ uid: 'lock-1' });
    lockDeleteMany.mockResolvedValue({ count: 1 });
  });

  it('sets the column and the lock, then replaces both on a second patch', async () => {
    profileFindUnique.mockResolvedValue({ uid: 'u1', bio: 'Ada' });

    const first = await service.patch('master_profile', ' u1 ', { bio: ' Ada ', emails: [{ value: 'a@b.com' }] }, actor);
    const second = await service.patch('master_profile', 'u1', { bio: 'Second' }, actor);

    expect(profileUpdate).toHaveBeenNthCalledWith(1, {
      where: { uid: 'u1' },
      data: { bio: 'Ada', emails: [{ value: 'a@b.com' }] },
    });
    expect(profileUpdate).toHaveBeenNthCalledWith(2, {
      where: { uid: 'u1' },
      data: { bio: 'Second' },
    });
    expect(lockUpsert).toHaveBeenNthCalledWith(1, {
      where: {
        subjectType_subjectUid_field: { subjectType: 'master_profile', subjectUid: 'u1', field: 'bio' },
      },
      create: expect.objectContaining({
        value: 'Ada',
        source: 'mcp',
        actorUid: 'm1',
        actorEmail: 'ada@example.com',
      }),
      update: expect.objectContaining({ value: 'Ada', source: 'mcp' }),
    });
    expect(lockUpsert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        update: expect.objectContaining({ value: 'Second' }),
      })
    );
    expect(first.locked).toEqual(['bio', 'emails']);
    expect(second.locked).toEqual(['bio']);
    expect(second.row).toEqual({ uid: 'u1', bio: 'Ada' });
  });

  it('stores an empty string and does not treat it as an unlock', async () => {
    await service.patch('master_profile', 'u1', { currentOrg: '' }, { source: 'service', actorUid: null, actorEmail: null });

    expect(profileUpdate).toHaveBeenCalledWith({ where: { uid: 'u1' }, data: { currentOrg: '' } });
    expect(lockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ value: '', source: 'service', actorUid: null, actorEmail: null }),
      })
    );
    expect(lockDeleteMany).not.toHaveBeenCalled();
  });

  it('deletes a lock and leaves the cell when the value is null', async () => {
    lockFindMany.mockResolvedValue([{ field: 'bio' }, { field: 'canonicalName' }]);
    profileFindUnique.mockResolvedValue({ uid: 'u1', bio: 'kept' });

    const result = await service.patch('master_profile', 'u1', { bio: null, canonicalName: null }, actor);

    expect(profileUpdate).not.toHaveBeenCalled();
    expect(lockDeleteMany).toHaveBeenCalledWith({
      where: { subjectType: 'master_profile', subjectUid: 'u1', field: { in: ['bio', 'canonicalName'] } },
    });
    expect(result).toEqual({ uid: 'u1', locked: [], unlocked: ['bio', 'canonicalName'], row: { uid: 'u1', bio: 'kept' } });
  });

  it('returns 400 when null targets a field that has no lock', async () => {
    lockFindMany.mockResolvedValue([]);

    const error = await service.patch('master_profile', 'u1', { bio: null }, actor).catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(errorBody(error)).toEqual({ message: 'invalid fields', errors: ['bio: no lock to clear'] });
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(lockDeleteMany).not.toHaveBeenCalled();
  });

  it('rejects unknown fields, identity fields, and values of the wrong type before writing', async () => {
    const error = await service
      .patch(
        'master_profile',
        'u1',
        { personKey: 'other', nope: 1, canonicalName: '  ', score: 1 },
        actor
      )
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(errorBody(error)).toEqual({
      message: 'invalid fields',
      errors: [
        'personKey: identity field cannot be updated',
        'nope: unknown field',
        'canonicalName: must be a non-empty string',
        'score: unknown field',
      ],
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 404 when the row is missing', async () => {
    profileFindUnique.mockResolvedValue(null);

    await expect(service.patch('master_profile', 'missing', { bio: 'Ada' }, actor)).rejects.toEqual(
      new NotFoundException('MasterProfile not found: missing')
    );
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(lockUpsert).not.toHaveBeenCalled();
  });

  it('locks an edge score and a path hop chain', async () => {
    await service.patch('connection_edge', 'e1', { score: 0.4, method: 'hybrid' }, actor);
    await service.patch('warm_path_v2', 'p1', { hopChain: { hops: [] }, hopCount: 2 }, actor);

    expect(edgeUpdate).toHaveBeenCalledWith({ where: { uid: 'e1' }, data: { score: 0.4, method: 'hybrid' } });
    expect(pathUpdate).toHaveBeenCalledWith({
      where: { uid: 'p1' },
      data: { hopChain: { hops: [] }, hopCount: 2 },
    });
  });

  it('rejects an edge identity field and an over-long method', async () => {
    const identity = await service
      .patch('connection_edge', 'e1', { relationKind: 'other' }, actor)
      .catch((caught) => caught);
    const tooLong = await service
      .patch('connection_edge', 'e1', { method: 'x'.repeat(17) }, actor)
      .catch((caught) => caught);

    expect(errorBody(identity)).toEqual({
      message: 'invalid fields',
      errors: ['relationKind: identity field cannot be updated'],
    });
    expect(errorBody(tooLong)).toEqual({
      message: 'invalid fields',
      errors: ['method: must be at most 16 characters'],
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('restores locked columns after ingest and skips rows with no lock', async () => {
    lockFindMany.mockResolvedValue([
      { subjectUid: 'u1', field: 'bio', value: 'kept' },
      { subjectUid: 'u1', field: 'enrichedAt', value: '2026-01-02T00:00:00.000Z' },
      { subjectUid: 'u1', field: 'emails', value: [{ value: 'a@b.com' }] },
    ]);

    await service.reapplyAll(tx as unknown as Prisma.TransactionClient, 'master_profile', ['u1', 'u1', 'u2']);

    expect(lockFindMany).toHaveBeenCalledWith({
      where: { subjectType: 'master_profile', subjectUid: { in: ['u1', 'u2'] } },
    });
    expect(profileUpdate).toHaveBeenCalledTimes(1);
    expect(profileUpdate).toHaveBeenCalledWith({
      where: { uid: 'u1' },
      data: {
        bio: 'kept',
        enrichedAt: new Date('2026-01-02T00:00:00.000Z'),
        emails: [{ value: 'a@b.com' }],
      },
    });
  });

  it('does not query when ingest created every row', async () => {
    await service.reapplyAll(tx as unknown as Prisma.TransactionClient, 'connection_edge', []);
    expect(lockFindMany).not.toHaveBeenCalled();
    expect(edgeUpdate).not.toHaveBeenCalled();
  });
});
