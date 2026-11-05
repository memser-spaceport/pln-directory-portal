import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SpvSpotlightInvestorListsService } from './spv-spotlight-investor-lists.service';

describe('SpvSpotlightInvestorListsService', () => {
  const storedList = {
    uid: 'list_1',
    name: 'Top angels',
    createdAt: new Date('2026-10-30T10:00:00Z'),
    updatedAt: new Date('2026-10-30T10:00:00Z'),
    entries: [{ email: 'ann@example.com' }, { email: 'bob@example.com' }],
  };

  function serviceWith(prisma: Record<string, unknown>) {
    return new SpvSpotlightInvestorListsService({
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1' }) },
      ...prisma,
    } as never);
  }

  function investor(uid: string, email: string | null) {
    return { uid, member: { email } };
  }

  it('lists the spotlight lists with their emails', async () => {
    const findMany = jest.fn().mockResolvedValue([storedList]);
    const service = serviceWith({ spvSpotlightInvestorList: { findMany } });

    const lists = await service.list('spv_1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { spvSpotlightUid: 'spv_1' } }));
    expect(lists).toEqual([
      {
        uid: 'list_1',
        name: 'Top angels',
        createdAt: storedList.createdAt,
        updatedAt: storedList.updatedAt,
        emails: ['ann@example.com', 'bob@example.com'],
      },
    ]);
  });

  it('throws NotFound when the spotlight does not exist', async () => {
    const service = serviceWith({ spvSpotlight: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.list('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a list from the emails of the selected investors in selection order', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([investor('part_2', 'bob@example.com'), investor('part_1', ' Ann@Example.com ')]);
    const create = jest.fn().mockResolvedValue(storedList);
    const service = serviceWith({
      spvSpotlightParticipant: { findMany },
      spvSpotlightInvestorList: { create },
    });

    const list = await service.create('spv_1', {
      name: 'Top angels',
      participantUids: ['part_1', 'part_2', 'part_1'],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { spvSpotlightUid: 'spv_1', type: 'INVESTOR', uid: { in: ['part_1', 'part_2', 'part_1'] } },
      })
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          spvSpotlightUid: 'spv_1',
          name: 'Top angels',
          entries: { create: [{ email: 'ann@example.com' }, { email: 'bob@example.com' }] },
        },
      })
    );
    expect(list.emails).toEqual(['ann@example.com', 'bob@example.com']);
  });

  it('skips participants that are not investors on the spotlight or have no email', async () => {
    const create = jest.fn().mockResolvedValue(storedList);
    const service = serviceWith({
      spvSpotlightParticipant: {
        findMany: jest.fn().mockResolvedValue([investor('part_1', 'ann@example.com'), investor('part_2', null)]),
      },
      spvSpotlightInvestorList: { create },
    });

    await service.create('spv_1', { name: 'Mixed', participantUids: ['founder_1', 'part_1', 'part_2'] });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entries: { create: [{ email: 'ann@example.com' }] } }),
      })
    );
  });

  it('rejects a list without any investor email of the spotlight', async () => {
    const create = jest.fn();
    const service = serviceWith({
      spvSpotlightParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      spvSpotlightInvestorList: { create },
    });

    await expect(service.create('spv_1', { name: 'Founders', participantUids: ['founder_1'] })).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('returns Conflict when the name is already used on the spotlight', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', 'P2002', 'test');
    const service = serviceWith({
      spvSpotlightParticipant: { findMany: jest.fn().mockResolvedValue([investor('part_1', 'ann@example.com')]) },
      spvSpotlightInvestorList: { create: jest.fn().mockRejectedValue(duplicate) },
    });

    await expect(service.create('spv_1', { name: 'Top angels', participantUids: ['part_1'] })).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('renames a list and keeps exactly the given emails, investors on the spotlight or not', async () => {
    const findFirst = jest.fn().mockResolvedValue({ uid: 'list_1' });
    const update = jest.fn().mockResolvedValue({ ...storedList, name: 'Lead angels' });
    const service = serviceWith({ spvSpotlightInvestorList: { findFirst, update } });

    const list = await service.update('spv_1', 'list_1', {
      name: 'Lead angels',
      emails: ['gone@example.com', 'Ann@example.com', 'ann@example.com'],
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uid: 'list_1', spvSpotlightUid: 'spv_1' } })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uid: 'list_1' },
        data: {
          name: 'Lead angels',
          entries: {
            deleteMany: { email: { notIn: ['gone@example.com', 'ann@example.com'] } },
            createMany: {
              data: [{ email: 'gone@example.com' }, { email: 'ann@example.com' }],
              skipDuplicates: true,
            },
          },
        },
      })
    );
    expect(list.name).toBe('Lead angels');
  });

  it('renames a list without touching its emails', async () => {
    const update = jest.fn().mockResolvedValue(storedList);
    const service = serviceWith({
      spvSpotlightInvestorList: { findFirst: jest.fn().mockResolvedValue({ uid: 'list_1' }), update },
    });

    await service.update('spv_1', 'list_1', { name: 'Top angels' });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'Top angels', entries: undefined } }));
  });

  it('throws NotFound when updating a list of another spotlight', async () => {
    const update = jest.fn();
    const service = serviceWith({
      spvSpotlightInvestorList: { findFirst: jest.fn().mockResolvedValue(null), update },
    });

    await expect(service.update('spv_1', 'list_other', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('returns Conflict when renaming to a name already used on the spotlight', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', 'P2002', 'test');
    const service = serviceWith({
      spvSpotlightInvestorList: {
        findFirst: jest.fn().mockResolvedValue({ uid: 'list_1' }),
        update: jest.fn().mockRejectedValue(duplicate),
      },
    });

    await expect(service.update('spv_1', 'list_1', { name: 'Taken' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes a list only within its spotlight', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = serviceWith({ spvSpotlightInvestorList: { deleteMany } });

    await expect(service.delete('spv_1', 'list_1')).resolves.toEqual({ success: true });
    expect(deleteMany).toHaveBeenCalledWith({ where: { uid: 'list_1', spvSpotlightUid: 'spv_1' } });
  });

  it('throws NotFound when the list is not on the spotlight', async () => {
    const service = serviceWith({
      spvSpotlightInvestorList: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });

    await expect(service.delete('spv_1', 'list_other')).rejects.toBeInstanceOf(NotFoundException);
  });
});
