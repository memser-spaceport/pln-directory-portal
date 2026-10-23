import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { fetchOgImageUrl } from '../utils/og-image';

// At most this many source pages are fetched at the same time.
export const TEAM_NEWS_IMAGE_FETCH_CONCURRENCY = 4;

/**
 * Stores the source page's og:image on team news items. `imageCheckedAt`
 * records that a fetch was tried, so a page without an image is not fetched
 * again. Every error is logged and swallowed: callers fire and forget.
 */
@Injectable()
export class TeamNewsImageService {
  private readonly logger = new Logger(TeamNewsImageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async fillImages(uids: string[]): Promise<void> {
    const uniqueUids = [...new Set(uids.filter(Boolean))];
    if (uniqueUids.length === 0) return;

    let rows: Array<{ uid: string; sourceUrl: string }>;
    try {
      rows = await this.prisma.teamNewsItem.findMany({
        where: { uid: { in: uniqueUids } },
        select: { uid: true, sourceUrl: true },
      });
    } catch (error) {
      this.logger.warn(`Failed to load team news items for image fill: ${errorMessage(error)}`);
      return;
    }

    let next = 0;
    const worker = async () => {
      while (next < rows.length) {
        const row = rows[next++];
        await this.fillOne(row);
      }
    };
    await Promise.all(Array.from({ length: Math.min(TEAM_NEWS_IMAGE_FETCH_CONCURRENCY, rows.length) }, worker));
  }

  private async fillOne(row: { uid: string; sourceUrl: string }): Promise<void> {
    try {
      const imageUrl = await fetchOgImageUrl(row.sourceUrl);
      await this.prisma.teamNewsItem.update({
        where: { uid: row.uid },
        data: { imageUrl, imageCheckedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(`Failed to fill image for team news item ${row.uid}: ${errorMessage(error)}`);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
