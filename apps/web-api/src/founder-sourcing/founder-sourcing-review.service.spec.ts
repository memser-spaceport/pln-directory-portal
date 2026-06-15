import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FounderSourcingReviewService } from './founder-sourcing-review.service';
import { PrismaService } from '../shared/prisma.service';
import { FounderReviewStatus } from '@prisma/client';

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
    findUnique.mockResolvedValue({ id: 1, reviewStatus: FounderReviewStatus.NEW });
    update.mockResolvedValue({ founderId: 'profile-001' });
  });

  it('rejects when status, channel, and note are all absent', async () => {
    await expect(service.updateReview('profile-001', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid status when provided', async () => {
    await expect(service.updateReview('profile-001', { status: 'invalid' as any })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects invalid channel', async () => {
    await expect(
      service.updateReview('profile-001', { channel: 'invalid' as any, note: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when founder not found', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.updateReview('missing', { status: 'approved' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates review with member uid on approve', async () => {
    await service.updateReview('profile-001', { status: 'approved' }, 'member-uid');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { founderId: 'profile-001' },
        data: expect.objectContaining({
          reviewStatus: FounderReviewStatus.APPROVED,
          reviewChannel: 'lead-decision',
          reviewedByMemberUid: 'member-uid',
        }),
      }),
    );
  });

  it('keeps existing status on feedback-only submit', async () => {
    await service.updateReview('profile-001', {
      channel: 'record-quality',
      field: 'why_now',
      note: 'stale line',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewStatus: FounderReviewStatus.NEW,
          reviewChannel: 'record-quality',
          reviewField: 'why_now',
          reviewNote: 'stale line',
        }),
      }),
    );
  });
});
