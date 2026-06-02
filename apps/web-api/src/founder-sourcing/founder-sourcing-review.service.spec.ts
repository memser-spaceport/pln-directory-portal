import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FounderSourcingReviewService } from './founder-sourcing-review.service';
import { PrismaService } from '../shared/prisma.service';

describe('FounderSourcingReviewService', () => {
  let service: FounderSourcingReviewService;
  const findUnique = jest.fn();
  const update = jest.fn();

  const prismaMock = {
    founderSourcingRecord: {
      findUnique,
      update,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FounderSourcingReviewService(prismaMock);
    findUnique.mockResolvedValue({ id: 1 });
    update.mockResolvedValue({ founderId: 'profile-001' });
  });

  it('rejects invalid status', async () => {
    await expect(service.updateReview('profile-001', { status: 'invalid' as any })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects invalid feedback', async () => {
    await expect(
      service.updateReview('profile-001', { status: 'approved', feedback: 'invalid' as any })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when founder not found', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.updateReview('missing', { status: 'approved' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates review with member uid', async () => {
    await service.updateReview('profile-001', { status: 'approved', feedback: 'good' }, 'member-uid');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { founderId: 'profile-001' },
        data: expect.objectContaining({
          reviewedByMemberUid: 'member-uid',
        }),
      })
    );
  });
});
