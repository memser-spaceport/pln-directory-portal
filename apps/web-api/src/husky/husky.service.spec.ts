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

  let persistent: { create: jest.Mock; upsertByKeyValue: jest.Mock; deleteDocByKeyValue: jest.Mock };
  let service: HuskyService;

  beforeEach(() => {
    process.env.MONGO_FEEDBACK_COLLECTION = 'feedback';
    persistent = { create: jest.fn(), upsertByKeyValue: jest.fn(), deleteDocByKeyValue: jest.fn() };
    service = new HuskyService({} as any, {} as any, persistent as any);
  });

  it('keeps one vote per answer: a new vote replaces the previous one and revives a removed one', async () => {
    await service.addHuskyFeedback(vote);

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

  it('removes the vote on an answer', async () => {
    await service.removeHuskyFeedback('q-1');

    expect(persistent.deleteDocByKeyValue).toHaveBeenCalledWith('feedback', 'questionId', 'q-1');
  });
});
