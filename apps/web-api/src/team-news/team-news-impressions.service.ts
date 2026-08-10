import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class TeamNewsImpressionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records feed-card impressions for a batch of news items. Each occurrence
   * of a uid in the array increments that item's viewCount by 1 — repeat
   * impressions within a batch (e.g. a card scrolling in/out of view) each
   * count. Unknown uids are silently ignored.
   */
  async recordImpressions(newsItemUids: string[]): Promise<void> {
    const countByUid = new Map<string, number>();
    for (const uid of newsItemUids) {
      countByUid.set(uid, (countByUid.get(uid) ?? 0) + 1);
    }

    const uidsByCount = new Map<number, string[]>();
    for (const [uid, count] of countByUid) {
      const group = uidsByCount.get(count) ?? [];
      group.push(uid);
      uidsByCount.set(count, group);
    }

    const writes = [...uidsByCount.entries()].map(([count, uids]) =>
      this.prisma.teamNewsItem.updateMany({
        where: { uid: { in: uids } },
        data: { viewCount: { increment: count } },
      })
    );

    await this.prisma.$transaction(writes);
  }
}
