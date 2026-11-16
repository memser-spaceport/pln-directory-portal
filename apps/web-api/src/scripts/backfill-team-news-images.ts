/**
 * Fill the og:image thumbnail of recent TeamNewsItem rows that were never
 * checked (`imageCheckedAt IS NULL`). Each row is processed once: the fill sets
 * `imageCheckedAt` with or without an image, so a second run does nothing.
 *
 * With `--variants` (LAB-3135), make the resized 16:9 JPEG copies for rows that
 * have an `imageUrl` but no copy yet (`imageUid IS NULL`), in the image bucket
 * (`AWS_S3_IMAGE_BUCKET_NAME`). Only stories whose `eventDate` is in the last
 * 90 days are processed: older stories do not show on Home.
 *
 *   yarn api:backfill-team-news-images                    # last 30 days
 *   yarn api:backfill-team-news-images -- --days 7
 *   yarn api:backfill-team-news-images -- --dry-run       # list only, no fetch, no write
 *   yarn api:backfill-team-news-images -- --variants      # resized copies, last 90 days
 *   yarn api:backfill-team-news-images -- --variants --days 14 --dry-run
 */
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../shared/prisma.service';
import { TeamNewsImageService } from '../team-news/team-news-image.service';
import { AwsService } from '../utils/aws/aws.service';

const BATCH_SIZE = 50;
const DEFAULT_DAYS = 30;
export const VARIANTS_MAX_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type BackfillArgs = { days: number; dryRun: boolean; variants: boolean };

export function parseArgs(argv: string[]): BackfillArgs {
  const dryRun = argv.includes('--dry-run');
  const variants = argv.includes('--variants');
  const daysIndex = argv.indexOf('--days');
  const rawDays = daysIndex >= 0 ? Number(argv[daysIndex + 1]) : variants ? VARIANTS_MAX_DAYS : DEFAULT_DAYS;
  if (!Number.isInteger(rawDays) || rawDays <= 0) {
    throw new Error(`--days must be a positive integer, got "${argv[daysIndex + 1]}"`);
  }
  if (variants && rawDays > VARIANTS_MAX_DAYS) {
    throw new Error(`--variants only backfills the last ${VARIANTS_MAX_DAYS} days, got --days ${rawDays}`);
  }
  return { days: rawDays, dryRun, variants };
}

export async function backfillTeamNewsImages(
  prisma: PrismaClient,
  imageService: Pick<TeamNewsImageService, 'fillImages'>,
  options: { days: number; dryRun: boolean; batchSize?: number; now?: Date }
): Promise<{ processed: number }> {
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const cutoff = new Date((options.now ?? new Date()).getTime() - options.days * MS_PER_DAY);
  let processed = 0;
  let lastId = 0;

  // Keyset paging on id: a row whose fill failed stays unchecked but is not
  // picked up again in the same run.
  for (;;) {
    const rows = await prisma.teamNewsItem.findMany({
      where: { imageCheckedAt: null, createdAt: { gte: cutoff }, id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true, uid: true, sourceUrl: true },
    });
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;
    processed += rows.length;

    if (options.dryRun) {
      for (const row of rows) console.log(`  would fill uid=${row.uid} ${row.sourceUrl}`);
      continue;
    }

    await imageService.fillImages(rows.map((row) => row.uid));
    console.log(`  sent ${processed} items to the image fill so far`);
  }

  return { processed };
}

/**
 * `--variants`: make the resized copies for stories in the window that have an
 * og:image and no copy yet. A row whose copy failed keeps `imageUid` null, so
 * the next run tries it again.
 */
export async function backfillTeamNewsImageVariants(
  prisma: PrismaClient,
  imageService: Pick<TeamNewsImageService, 'fillVariants'>,
  options: { days: number; dryRun: boolean; batchSize?: number; now?: Date }
): Promise<{ processed: number; stored: number }> {
  const days = Math.min(options.days, VARIANTS_MAX_DAYS);
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const cutoff = new Date((options.now ?? new Date()).getTime() - days * MS_PER_DAY);
  let processed = 0;
  let stored = 0;
  let lastId = 0;

  for (;;) {
    const rows = await prisma.teamNewsItem.findMany({
      where: { imageUrl: { not: null }, imageUid: null, eventDate: { gte: cutoff }, id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true, uid: true, imageUrl: true },
    });
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;
    processed += rows.length;

    if (options.dryRun) {
      for (const row of rows) console.log(`  would copy uid=${row.uid} ${row.imageUrl}`);
      continue;
    }

    stored += await imageService.fillVariants(rows.map((row) => row.uid));
    console.log(`  stored copies for ${stored} of ${processed} items so far`);
  }

  return { processed, stored };
}

async function main() {
  const { days, dryRun, variants } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const imageService = new TeamNewsImageService(prisma as unknown as PrismaService, new AwsService());
    if (variants) {
      console.log(`Backfill team news image copies: last ${days} days${dryRun ? ' (dry run)' : ''}`);
      const { processed, stored } = await backfillTeamNewsImageVariants(prisma, imageService, { days, dryRun });
      console.log(
        dryRun ? `Done: ${processed} items would be copied` : `Done: stored copies for ${stored} of ${processed} items`
      );
      return;
    }
    console.log(`Backfill team news images: last ${days} days${dryRun ? ' (dry run)' : ''}`);
    const { processed } = await backfillTeamNewsImages(prisma, imageService, { days, dryRun });
    // fillImages logs and skips a row it cannot fill; such a row stays unchecked for the next run.
    console.log(`Done: ${processed} items ${dryRun ? 'would be sent' : 'sent'} to the image fill`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
