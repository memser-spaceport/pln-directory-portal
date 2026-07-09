import { Injectable, NotFoundException } from '@nestjs/common';
import type { TeamNewsUpvoteStatus } from 'libs/contracts/src/schema/team-news';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class TeamNewsUpvotesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upvote a news item. Idempotent: re-upvoting succeeds without double-counting. */
  async upvote(memberUid: string, newsItemUid: string): Promise<TeamNewsUpvoteStatus> {
    await this.assertNewsItemExists(newsItemUid);

    await this.prisma.teamNewsUpvote.upsert({
      where: {
        newsItemUid_memberUid: { newsItemUid, memberUid },
      },
      create: { newsItemUid, memberUid },
      update: {},
    });

    return this.buildStatus(newsItemUid, true);
  }

  /** Remove an upvote. Idempotent: removing when not upvoted succeeds. */
  async removeUpvote(memberUid: string, newsItemUid: string): Promise<TeamNewsUpvoteStatus> {
    await this.assertNewsItemExists(newsItemUid);

    await this.prisma.teamNewsUpvote.deleteMany({
      where: { newsItemUid, memberUid },
    });

    return this.buildStatus(newsItemUid, false);
  }

  private async assertNewsItemExists(newsItemUid: string): Promise<void> {
    const item = await this.prisma.teamNewsItem.findUnique({
      where: { uid: newsItemUid },
      select: { uid: true },
    });
    if (!item) {
      throw new NotFoundException(`Team news item with uid ${newsItemUid} not found`);
    }
  }

  private async buildStatus(newsItemUid: string, viewerHasUpvoted: boolean): Promise<TeamNewsUpvoteStatus> {
    const upvoteCount = await this.prisma.teamNewsUpvote.count({ where: { newsItemUid } });
    return { upvoteCount, viewerHasUpvoted };
  }
}
