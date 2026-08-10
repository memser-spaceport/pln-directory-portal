import { PrismaService } from '../shared/prisma.service';
import { TeamNewsImpressionsService } from './team-news-impressions.service';

describe('TeamNewsImpressionsService', () => {
  let service: TeamNewsImpressionsService;

  const teamNewsItemUpdateMany = jest.fn();
  const transaction = jest.fn();

  const prismaMock = {
    teamNewsItem: { updateMany: teamNewsItemUpdateMany },
    $transaction: transaction,
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    teamNewsItemUpdateMany.mockResolvedValue({ count: 1 });
    transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
    service = new TeamNewsImpressionsService(prismaMock);
  });

  it('increments each uid once for a batch with no duplicates', async () => {
    await service.recordImpressions(['news-1', 'news-2']);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(teamNewsItemUpdateMany).toHaveBeenCalledTimes(1);
    expect(teamNewsItemUpdateMany).toHaveBeenCalledWith({
      where: { uid: { in: ['news-1', 'news-2'] } },
      data: { viewCount: { increment: 1 } },
    });
  });

  it('increments a repeated uid by the number of occurrences in the batch', async () => {
    await service.recordImpressions(['news-1', 'news-1', 'news-1', 'news-2']);

    expect(teamNewsItemUpdateMany).toHaveBeenCalledTimes(2);
    expect(teamNewsItemUpdateMany).toHaveBeenCalledWith({
      where: { uid: { in: ['news-1'] } },
      data: { viewCount: { increment: 3 } },
    });
    expect(teamNewsItemUpdateMany).toHaveBeenCalledWith({
      where: { uid: { in: ['news-2'] } },
      data: { viewCount: { increment: 1 } },
    });
  });

  it('does not error when the batch includes an unknown uid (updateMany silently no-ops)', async () => {
    teamNewsItemUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.recordImpressions(['unknown-uid'])).resolves.toBeUndefined();
    expect(teamNewsItemUpdateMany).toHaveBeenCalledWith({
      where: { uid: { in: ['unknown-uid'] } },
      data: { viewCount: { increment: 1 } },
    });
  });

  it('wraps all grouped writes in a single transaction', async () => {
    await service.recordImpressions(['news-1', 'news-2', 'news-2']);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][0]).toHaveLength(2);
  });
});
