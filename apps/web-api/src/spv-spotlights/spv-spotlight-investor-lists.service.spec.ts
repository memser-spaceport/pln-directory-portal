import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SpvSpotlightInvestorListsService } from './spv-spotlight-investor-lists.service';

describe('SpvSpotlightInvestorListsService', () => {
  const storedList = {
    uid: 'list_1',
    name: 'Top angels',
    createdAt: new Date('2026-10-30T10:00:00Z'),
    updatedAt: new Date('2026-10-30T10:00:00Z'),
    participants: [{ participantUid: 'part_1' }, { participantUid: 'part_2' }],
  };

  function serviceWith(prisma: Record<string, unknown>) {
    return new SpvSpotlightInvestorListsService({
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1' }) },
      ...prisma,
    } as never);
  }

  it('lists the spotlight lists with their participant uids', async () => {
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
        participantUids: ['part_1', 'part_2'],
      },
    ]);
  });

  it('throws NotFound when the spotlight does not exist', async () => {
    const service = serviceWith({ spvSpotlight: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.list('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a list from deduplicated investor uids', async () => {
    const count = jest.fn().mockResolvedValue(2);
    const create = jest.fn().mockResolvedValue(storedList);
    const service = serviceWith({
      spvSpotlightParticipant: { count },
      spvSpotlightInvestorList: { create },
    });

    const list = await service.create('spv_1', {
      name: 'Top angels',
      participantUids: ['part_1', 'part_2', 'part_1'],
    });

    expect(count).toHaveBeenCalledWith({
      where: { spvSpotlightUid: 'spv_1', type: 'INVESTOR', uid: { in: ['part_1', 'part_2'] } },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          spvSpotlightUid: 'spv_1',
          name: 'Top angels',
          participants: { create: [{ participantUid: 'part_1' }, { participantUid: 'part_2' }] },
        },
      })
    );
    expect(list.participantUids).toEqual(['part_1', 'part_2']);
  });

  it('rejects participants that are not investors on the spotlight', async () => {
    const create = jest.fn();
    const service = serviceWith({
      spvSpotlightParticipant: { count: jest.fn().mockResolvedValue(1) },
      spvSpotlightInvestorList: { create },
    });

    await expect(
      service.create('spv_1', { name: 'Mixed', participantUids: ['part_1', 'founder_1'] })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns Conflict when the name is already used on the spotlight', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', 'P2002', 'test');
    const service = serviceWith({
      spvSpotlightParticipant: { count: jest.fn().mockResolvedValue(1) },
      spvSpotlightInvestorList: { create: jest.fn().mockRejectedValue(duplicate) },
    });

    await expect(service.create('spv_1', { name: 'Top angels', participantUids: ['part_1'] })).rejects.toBeInstanceOf(
      ConflictException
    );
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
