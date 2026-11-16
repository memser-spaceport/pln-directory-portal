import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { AwsService } from '../utils/aws/aws.service';
import { fetchOgImageUrl, fetchPublicImage } from '../utils/og-image';
import { newsImageKey, RenderedNewsImage, renderNewsImageVariants } from './utils/news-image-variants';

// At most this many source pages are fetched at the same time.
export const TEAM_NEWS_IMAGE_FETCH_CONCURRENCY = 4;

/**
 * Stores the source page's og:image on team news items. `imageCheckedAt`
 * records that a fetch was tried, so a page without an image is not fetched
 * again. Every error is logged and swallowed: callers fire and forget.
 *
 * LAB-3135: when an og:image is found, the service also keeps our own 16:9
 * JPEG copy and its resized copies in the image bucket, linked through
 * `imageUid`. A failed copy leaves `imageUrl` as it is and `imageUid` null.
 */
@Injectable()
export class TeamNewsImageService {
  private readonly logger = new Logger(TeamNewsImageService.name);

  constructor(private readonly prisma: PrismaService, private readonly awsService: AwsService) {}

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

    await runPool(rows, (row) => this.fillOne(row));
  }

  /**
   * Make the resized copies for items that already have an `imageUrl` but no
   * copy yet (the backfill's `--variants` mode). Returns how many items got one.
   */
  async fillVariants(uids: string[]): Promise<number> {
    const uniqueUids = [...new Set(uids.filter(Boolean))];
    if (uniqueUids.length === 0) return 0;

    let rows: Array<{ uid: string; imageUrl: string | null }>;
    try {
      rows = await this.prisma.teamNewsItem.findMany({
        where: { uid: { in: uniqueUids }, imageUrl: { not: null }, imageUid: null },
        select: { uid: true, imageUrl: true },
      });
    } catch (error) {
      this.logger.warn(`Failed to load team news items for image variants: ${errorMessage(error)}`);
      return 0;
    }

    let stored = 0;
    await runPool(rows, async (row) => {
      if (row.imageUrl && (await this.storeVariants(row.uid, row.imageUrl))) stored++;
    });
    return stored;
  }

  private async fillOne(row: { uid: string; sourceUrl: string }): Promise<void> {
    let imageUrl: string | null;
    try {
      imageUrl = await fetchOgImageUrl(row.sourceUrl);
      await this.prisma.teamNewsItem.update({
        where: { uid: row.uid },
        data: { imageUrl, imageCheckedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(`Failed to fill image for team news item ${row.uid}: ${errorMessage(error)}`);
      return;
    }
    if (imageUrl) {
      await this.storeVariants(row.uid, imageUrl);
    }
  }

  /** Download, crop, resize, upload and link. Never throws; false when no copy was stored. */
  private async storeVariants(newsItemUid: string, imageUrl: string): Promise<boolean> {
    const bucket = process.env.AWS_S3_IMAGE_BUCKET_NAME;
    if (!bucket) {
      this.logger.debug(`No image bucket set: no image copies for team news item ${newsItemUid}`);
      return false;
    }
    try {
      const source = await fetchPublicImage(imageUrl);
      if (!source) {
        this.logger.warn(`Could not download the image of team news item ${newsItemUid}`);
        return false;
      }
      const rendered = await renderNewsImageVariants(source);
      const uploaded = await Promise.all(rendered.map((copy) => this.upload(bucket, newsItemUid, copy)));
      const [original, ...thumbnails] = uploaded;

      await this.prisma.teamNewsItem.update({
        where: { uid: newsItemUid },
        data: {
          image: {
            create: {
              ...original,
              thumbnails: { createMany: { data: thumbnails } },
            },
          },
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to store image copies for team news item ${newsItemUid}: ${errorMessage(error)}`);
      return false;
    }
  }

  private async upload(bucket: string, newsItemUid: string, copy: RenderedNewsImage) {
    const key = newsImageKey(newsItemUid, copy.width);
    const response = await this.awsService.uploadFileToS3({ buffer: copy.buffer, mimetype: 'image/jpeg' }, bucket, key);
    if (!response?.Location) {
      throw new Error(`The upload of ${key} returned no location`);
    }
    return {
      cid: `team-news/${newsItemUid}`,
      url: response.Location,
      filename: `${copy.width}.jpg`,
      width: copy.width,
      height: copy.height,
      size: copy.buffer.length,
      type: 'jpeg',
      version: copy.version,
    };
  }
}

// Run `task` over `items` with at most TEAM_NEWS_IMAGE_FETCH_CONCURRENCY at a time.
async function runPool<T>(items: T[], task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(TEAM_NEWS_IMAGE_FETCH_CONCURRENCY, items.length) }, worker));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
