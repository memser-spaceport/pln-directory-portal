import { ImageSize, Prisma } from '@prisma/client';
import sharp from 'sharp';
import type { TeamNewsImage } from 'libs/contracts/src/schema/team-news';

/**
 * LAB-3135: resized 16:9 JPEG copies of a news item's og:image, for `srcset`.
 * JPEG, not WebP: the digest email shows the image, and Outlook desktop
 * cannot show WebP.
 */

/** The resized widths and the `Image.version` each one is stored as. */
export const NEWS_IMAGE_VARIANT_WIDTHS: ReadonlyArray<{ width: number; version: ImageSize }> = [
  { width: 400, version: 'TINY' },
  { width: 800, version: 'SMALL' },
  { width: 1200, version: 'MEDIUM' },
  { width: 1800, version: 'LARGE' },
];

export const NEWS_IMAGE_JPEG_QUALITY = 80;

/** About 7000 × 7000. A larger source is refused before it is decoded. */
const NEWS_IMAGE_MAX_INPUT_PIXELS = 50_000_000;

export type RenderedNewsImage = { width: number; height: number; version: ImageSize; buffer: Buffer };

/** S3 key of one stored copy. */
export function newsImageKey(newsItemUid: string, width: number): string {
  return `team-news/${newsItemUid}/${width}.jpg`;
}

/** The largest 16:9 box inside a width × height source. */
export function cropTo16x9(width: number, height: number): { width: number; height: number } {
  const cropWidth = Math.min(width, Math.floor((height * 16) / 9));
  return { width: cropWidth, height: Math.round((cropWidth * 9) / 16) };
}

/**
 * Crop the source to 16:9 at the centre, then make the ORIGINAL at the
 * cropped size and one copy per variant width smaller than it. The ORIGINAL
 * comes first. Throws when the bytes are not an image sharp can read.
 */
export async function renderNewsImageVariants(source: Buffer): Promise<RenderedNewsImage[]> {
  const meta = await sharp(source, { limitInputPixels: NEWS_IMAGE_MAX_INPUT_PIXELS }).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('The image has no size');
  }
  // EXIF orientations 5 to 8 turn the image by 90 degrees.
  const turned = (meta.orientation ?? 1) >= 5;
  const crop = cropTo16x9(turned ? meta.height : meta.width, turned ? meta.width : meta.height);
  if (crop.width < 1 || crop.height < 1) {
    throw new Error('The image is too small');
  }

  const sizes: Array<{ width: number; height: number; version: ImageSize }> = [
    { ...crop, version: 'ORIGINAL' },
    ...NEWS_IMAGE_VARIANT_WIDTHS.filter((v) => v.width < crop.width).map((v) => ({
      width: v.width,
      height: Math.round((v.width * 9) / 16),
      version: v.version,
    })),
  ];

  return Promise.all(
    sizes.map(async (size) => ({
      ...size,
      buffer: await sharp(source, { limitInputPixels: NEWS_IMAGE_MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: size.width, height: size.height, fit: 'cover', position: 'centre' })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: NEWS_IMAGE_JPEG_QUALITY, progressive: true })
        .toBuffer(),
    }))
  );
}

/** Add to a TeamNewsItem `include` or `select` so `toNewsImageDto` can read the copies. */
export const TEAM_NEWS_IMAGE_SELECT = Prisma.validator<Prisma.TeamNewsItemSelect>()({
  image: {
    select: {
      width: true,
      height: true,
      url: true,
      thumbnails: { select: { width: true, url: true } },
    },
  },
});

export type NewsImageRow = {
  width: number;
  height: number;
  url: string;
  thumbnails: Array<{ width: number; url: string }>;
} | null;

/** The DTO `image` field: every stored copy narrowest first, or null. */
export function toNewsImageDto(image: NewsImageRow | undefined): TeamNewsImage | null {
  if (!image || !image.url || image.width < 1 || image.height < 1) {
    return null;
  }
  const variants = [
    ...image.thumbnails.filter((t) => t.url && t.width >= 1 && t.width < image.width),
    { width: image.width, url: image.url },
  ]
    .map((v) => ({ width: v.width, url: v.url }))
    .sort((a, b) => a.width - b.width);
  return { width: image.width, height: image.height, variants };
}
