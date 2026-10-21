/**
 * Fill the og:image thumbnail of recent TeamNewsItem rows that were never
 * checked (`imageCheckedAt IS NULL`). Each row is processed once: the fill sets
 * `imageCheckedAt` with or without an image, so a second run does nothing.
 *
 *   yarn api:backfill-team-news-images                    # last 30 days
 *   yarn api:backfill-team-news-images -- --days 7
 *   yarn api:backfill-team-news-images -- --dry-run       # list only, no fetch, no write
 */
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../shared/prisma.service';
import { TeamNewsImageService } from '../team-news/team-news-image.service';

const BATCH_SIZE = 50;
const DEFAULT_DAYS = 30;

export function parseArgs(argv: string[]): { days: number; dryRun: boolean } {
  const dryRun = argv.includes('--dry-run');
  const daysIndex = argv.indexOf('--days');
  const rawDays = daysIndex >= 0 ? Number(argv[daysIndex + 1]) : DEFAULT_DAYS;
  if (!Number.isInteger(rawDays) || rawDays <= 0) {
    throw new Error(`--days must be a positive integer, got "${argv[daysIndex + 1]}"`);
  }
  return { days: rawDays, dryRun };
}

export async function backfillTeamNewsImages(
  prisma: PrismaClient,
  imageService: Pick<TeamNewsImageService, 'fillImages'>,
  options: { days: number; dryRun: boolean; batchSize?: number; now?: Date }
): Promise<{ processed: number }> {
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const cutoff = new Date((options.now ?? new Date()).getTime() - options.days * 24 * 60 * 60 * 1000);
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

async function main() {
  const { days, dryRun } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    console.log(`Backfill team news images: last ${days} days${dryRun ? ' (dry run)' : ''}`);
    const imageService = new TeamNewsImageService(prisma as unknown as PrismaService);
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
