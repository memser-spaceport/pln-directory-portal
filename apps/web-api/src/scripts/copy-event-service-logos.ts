/**
 * One-time copy of event logos out of the events service's S3 buckets into the LabOS image bucket
 * (`AWS_S3_IMAGE_BUCKET_NAME`), before those buckets are removed with the events service (LAB-3329).
 *
 * An event logo is an `Image` row that holds a URL. The script finds the logos of events whose URL is on a
 * `pl-events-service*` bucket, downloads each picture, uploads it under `events/logos/`, and points the `Image`
 * row (`url` and `cid`) at the copy. Logos hosted elsewhere (Luma, the LabOS buckets) are left as they are.
 * A row that is already copied no longer matches, so a second run does nothing.
 *
 *   yarn api:copy-event-service-logos             # dry run: lists the rows, changes nothing
 *   yarn api:copy-event-service-logos -- --apply  # copies and updates the rows
 *   yarn api:copy-event-service-logos -- --apply --limit 20
 */
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { createHash } from 'crypto';
import * as path from 'path';
import { AwsService } from '../utils/aws/aws.service';

/** `pl-events-service` (dev) and `pl-events-service-prod`, as an S3 host. */
const EVENTS_SERVICE_BUCKET_HOST = /^pl-events-service[a-z0-9-]*\.s3[.-][a-z0-9.-]*amazonaws\.com$/i;
const DOWNLOAD_TIMEOUT_MS = 30000;
const MAX_LOGO_BYTES = 15 * 1024 * 1024;

export type CopyLogosArgs = { apply: boolean; limit: number | null };

export function parseArgs(argv: string[]): CopyLogosArgs {
  const limitIndex = argv.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error(`--limit must be a positive integer, got "${argv[limitIndex + 1]}"`);
  }
  return { apply: argv.includes('--apply'), limit };
}

export function isEventsServiceLogoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && EVENTS_SERVICE_BUCKET_HOST.test(parsed.hostname);
  } catch {
    return false;
  }
}

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

/** `events/logos/<hash of the source URL><extension>`: stable, so a re-run writes the same object. */
export function logoKey(sourceUrl: string): string {
  const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
  const safeExtension = extension in CONTENT_TYPES ? extension : '';
  return `events/logos/${createHash('sha256').update(sourceUrl).digest('hex').slice(0, 40)}${safeExtension}`;
}

export type LogoRow = { uid: string; url: string; events: number };

export type LogoStore = {
  download: (url: string) => Promise<{ buffer: Buffer; contentType: string | null }>;
  upload: (key: string, buffer: Buffer, contentType: string) => Promise<string>;
};

/** The logos of events that sit on an events-service bucket, each once, with how many events use it. */
export async function findEventServiceLogos(prisma: PrismaClient, limit: number | null): Promise<LogoRow[]> {
  const images = await prisma.image.findMany({
    where: { url: { contains: 'pl-events-service' }, eventLogo: { some: {} } },
    orderBy: { id: 'asc' },
    select: { uid: true, url: true, _count: { select: { eventLogo: true } } },
  });
  const rows = images
    .filter((image) => isEventsServiceLogoUrl(image.url))
    .map((image) => ({ uid: image.uid, url: image.url, events: image._count.eventLogo }));
  return limit ? rows.slice(0, limit) : rows;
}

export async function copyEventServiceLogos(
  prisma: PrismaClient,
  store: LogoStore,
  args: CopyLogosArgs,
  log: (line: string) => void = console.log
): Promise<{ found: number; copied: number; failed: number }> {
  const rows = await findEventServiceLogos(prisma, args.limit);
  let copied = 0;
  let failed = 0;

  for (const row of rows) {
    if (!args.apply) {
      log(`  would copy image=${row.uid} events=${row.events} ${row.url} -> ${logoKey(row.url)}`);
      continue;
    }
    try {
      const { buffer, contentType } = await store.download(row.url);
      const extension = path.extname(new URL(row.url).pathname).toLowerCase();
      const type = contentType?.startsWith('image/') ? contentType : CONTENT_TYPES[extension];
      if (!type) throw new Error(`not an image (content type ${contentType ?? 'unknown'})`);
      const location = await store.upload(logoKey(row.url), buffer, type);
      if (!location) throw new Error('the upload returned no address');
      await prisma.image.update({ where: { uid: row.uid }, data: { url: location, cid: location } });
      copied += 1;
      log(`  copied image=${row.uid} ${row.url} -> ${location}`);
    } catch (error) {
      failed += 1;
      log(`  FAILED image=${row.uid} ${row.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { found: rows.length, copied, failed };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bucket = process.env.AWS_S3_IMAGE_BUCKET_NAME;
  if (args.apply && !bucket) {
    throw new Error('AWS_S3_IMAGE_BUCKET_NAME is not set');
  }
  const prisma = new PrismaClient();
  const aws = new AwsService();
  const store: LogoStore = {
    download: async (url) => {
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxContentLength: MAX_LOGO_BYTES,
      });
      const contentType = response.headers['content-type'];
      return { buffer: Buffer.from(response.data), contentType: typeof contentType === 'string' ? contentType : null };
    },
    upload: async (key, buffer, contentType) => {
      const result = await aws.uploadFileToS3({ buffer, mimetype: contentType }, bucket, key);
      return result?.Location ?? '';
    },
  };

  try {
    console.log(args.apply ? 'Copying event logos…' : 'Dry run: nothing is changed. Pass --apply to copy.');
    const result = await copyEventServiceLogos(prisma, store, args);
    console.log(
      args.apply
        ? `Done: ${result.copied} copied, ${result.failed} failed, of ${result.found} logos on an events-service bucket.`
        : `Dry run done: ${result.found} logos on an events-service bucket would be copied.`
    );
    if (result.failed > 0) process.exitCode = 1;
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
