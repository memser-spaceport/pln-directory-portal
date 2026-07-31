import { Injectable, NotFoundException } from '@nestjs/common';
import type { FeedNewsLikeStatus } from 'libs/contracts/src/schema/feed';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class FeedLikesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Like a Feed News item. Idempotent: re-liking succeeds without double-counting. */
  async like(memberUid: string, newsItemUid: string): Promise<FeedNewsLikeStatus> {
    const newsItem = await this.prisma.teamNewsItem.findUnique({ where: { uid: newsItemUid }, select: { uid: true } });
    if (!newsItem) {
      throw new NotFoundException(`News item with uid ${newsItemUid} not found`);
    }

    await this.prisma.feedNewsLike.upsert({
      where: {
        newsItemUid_memberUid: { newsItemUid, memberUid },
      },
      create: { newsItemUid, memberUid },
      update: {},
    });

    return this.buildStatus(newsItemUid, true);
  }

  /** Remove a like. Idempotent: removing when not liked succeeds. */
  async unlike(memberUid: string, newsItemUid: string): Promise<FeedNewsLikeStatus> {
    await this.prisma.feedNewsLike.deleteMany({
      where: { newsItemUid, memberUid },
    });

    return this.buildStatus(newsItemUid, false);
  }

  private async buildStatus(newsItemUid: string, viewerHasLiked: boolean): Promise<FeedNewsLikeStatus> {
    const likeCount = await this.prisma.feedNewsLike.count({ where: { newsItemUid } });
    return { likeCount, viewerHasLiked };
  }
}
