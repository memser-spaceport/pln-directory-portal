import { Injectable } from '@nestjs/common';
import type { FeedForumPostLikeStatus } from 'libs/contracts/src/schema/feed';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class FeedLikesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Like a forum-post feed item. Idempotent: re-liking succeeds without double-counting. */
  async like(memberUid: string, forumPostUid: string): Promise<FeedForumPostLikeStatus> {
    await this.prisma.feedForumPostLike.upsert({
      where: {
        forumPostUid_memberUid: { forumPostUid, memberUid },
      },
      create: { forumPostUid, memberUid },
      update: {},
    });

    return this.buildStatus(forumPostUid, true);
  }

  /** Remove a like. Idempotent: removing when not liked succeeds. */
  async unlike(memberUid: string, forumPostUid: string): Promise<FeedForumPostLikeStatus> {
    await this.prisma.feedForumPostLike.deleteMany({
      where: { forumPostUid, memberUid },
    });

    return this.buildStatus(forumPostUid, false);
  }

  private async buildStatus(forumPostUid: string, viewerHasLiked: boolean): Promise<FeedForumPostLikeStatus> {
    const likeCount = await this.prisma.feedForumPostLike.count({ where: { forumPostUid } });
    return { likeCount, viewerHasLiked };
  }
}
