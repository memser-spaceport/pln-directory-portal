import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { HuskyService } from './husky.service';

describe('HuskyService feedback', () => {
  const vote = {
    prompt: 'Who works on storage?',
    response: 'Saturn Grid.',
    rating: 1,
    comment: '',
    threadId: 'thread-1',
    questionId: 'q-1',
    reasons: ['Wrong matches'],
  };

  let persistent: {
    create: jest.Mock;
    upsertByKeyValue: jest.Mock;
    deleteDocByKeyValue: jest.Mock;
    findOneByKeyValue: jest.Mock;
  };
  let service: HuskyService;

  beforeEach(() => {
    process.env.MONGO_FEEDBACK_COLLECTION = 'feedback';
    persistent = {
      create: jest.fn(),
      upsertByKeyValue: jest.fn(),
      deleteDocByKeyValue: jest.fn(),
      findOneByKeyValue: jest.fn().mockResolvedValue(null),
    };
    service = new HuskyService({} as any, {} as any, persistent as any);
  });

  it('keeps one vote per answer: a new vote replaces the previous one and revives a removed one', async () => {
    await service.addHuskyFeedback(vote, 'jane@example.com');

    expect(persistent.upsertByKeyValue).toHaveBeenCalledWith(
      'feedback',
      'questionId',
      'q-1',
      expect.objectContaining({ rating: 1, reasons: ['Wrong matches'], isDeleted: false })
    );
    expect(persistent.create).not.toHaveBeenCalled();
  });

  it('stores a vote without an answer id as a new record', async () => {
    const { questionId, threadId, ...legacyVote } = vote;

    await service.addHuskyFeedback(legacyVote);

    expect(persistent.create).toHaveBeenCalledWith('feedback', expect.objectContaining({ rating: 1 }));
    expect(persistent.upsertByKeyValue).not.toHaveBeenCalled();
  });

  it('overwrites an existing vote only for its owner', async () => {
    persistent.findOneByKeyValue.mockResolvedValue({ email: 'jane@example.com' });
    await expect(service.addHuskyFeedback(vote, 'john@example.com')).rejects.toBeInstanceOf(ForbiddenException);
    expect(persistent.upsertByKeyValue).not.toHaveBeenCalled();

    await service.addHuskyFeedback(vote, 'jane@example.com');
    expect(persistent.upsertByKeyValue).toHaveBeenCalled();
  });

  it('refuses a no-email token overwriting a legacy vote that has no email', async () => {
    persistent.findOneByKeyValue.mockResolvedValue({ rating: 0 });
    await expect(service.addHuskyFeedback(vote)).rejects.toBeInstanceOf(ForbiddenException);
    expect(persistent.upsertByKeyValue).not.toHaveBeenCalled();
  });

  it('refuses a no-email token claiming a new questionId with a body email', async () => {
    await expect(service.addHuskyFeedback({ ...vote, email: 'jane@example.com' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(persistent.upsertByKeyValue).not.toHaveBeenCalled();
  });

  it('refuses to delete a vote that is missing or owned by someone else', async () => {
    await expect(service.removeHuskyFeedback('q-1', 'jane@example.com')).rejects.toBeInstanceOf(NotFoundException);
    persistent.findOneByKeyValue.mockResolvedValue({ email: 'jane@example.com' });
    await expect(service.removeHuskyFeedback('q-1', 'john@example.com')).rejects.toBeInstanceOf(NotFoundException);
    expect(persistent.deleteDocByKeyValue).not.toHaveBeenCalled();
  });

  it('removes the vote on an answer', async () => {
    persistent.findOneByKeyValue.mockResolvedValue({ email: 'jane@example.com' });
    await service.removeHuskyFeedback('q-1', 'jane@example.com');

    expect(persistent.deleteDocByKeyValue).toHaveBeenCalledWith('feedback', 'questionId', 'q-1');
  });
});
