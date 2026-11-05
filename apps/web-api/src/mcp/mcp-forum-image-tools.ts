import { BadRequestException, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { ImagesService } from '../images/images.service';
import { isAllowedOgPageUrl, resolvePublicAddresses } from '../utils/og-image';
import { McpToolDef } from './mcp-tools';

/**
 * Images for forum posts (LAB-3156). The forum editor never sends a file to NodeBB: it stores it through the
 * Directory API (`POST /v1/images`, `ImagesService.upload`) and puts the returned URL in the post. This tool does the
 * same for an agent and returns the URL with ready Markdown for start_forum_thread, reply_to_forum_thread or
 * edit_forum_post.
 *
 * MCP has no way to pass a file into a tool, so the agent hands the image over as a public https URL (LabOS keeps its
 * own copy, so the post does not depend on the source staying up) or as base64 data (agents that can read a local
 * file). The type is taken from the file's own bytes, never from what the agent says it is.
 */

/** base64 travels in the JSON body, whose limit is 5 MB (main.config.ts): 2 MB of image is ~2.7 MB of base64. */
export const FORUM_IMAGE_DATA_MAX_BYTES = 2 * 1024 * 1024;
export const FORUM_IMAGE_URL_MAX_BYTES = 5 * 1024 * 1024;
const BASE64_MAX_CHARS = Math.ceil(FORUM_IMAGE_DATA_MAX_BYTES / 3) * 4 + 128;
const IMAGE_URL_MAX = 2048;
const ALT_MAX = 200;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'LabOS-ForumImage/1.0';

const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const;
export type ForumImageType = keyof typeof IMAGE_TYPES;

const NOT_AN_IMAGE = 'Only JPEG, PNG, WebP or GIF images can be uploaded.';
const BAD_URL = 'imageUrl must be a public https URL of an image.';

const logger = new Logger('McpForumImageTools');

type ImageStore = Pick<ImagesService, 'upload'>;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The image type from the file's first bytes (its magic number), or null when it is none of the four. */
export function sniffImageType(bytes: Buffer): ForumImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return 'image/png';
  const head = bytes.subarray(0, 12).toString('latin1');
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif';
  if (head.length === 12 && head.startsWith('RIFF') && head.endsWith('WEBP')) return 'image/webp';
  return null;
}

function tooLarge(max: number): BadRequestException {
  return new BadRequestException(`The image is larger than ${max / (1024 * 1024)} MB.`);
}

/** base64 (optionally a `data:image/...;base64,` URL) to bytes, refusing anything that is not clean base64. */
export function decodeImageData(data: string): Buffer {
  const payload = data
    .trim()
    .replace(/^data:[^,]*;base64,/i, '')
    .replace(/\s+/g, '');
  if (!payload || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    throw new BadRequestException('data must be the image file as base64.');
  }
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length > FORUM_IMAGE_DATA_MAX_BYTES) {
    throw tooLarge(FORUM_IMAGE_DATA_MAX_BYTES);
  }
  return bytes;
}

async function readCapped(response: Response, max: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) {
    throw tooLarge(max);
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > max) throw tooLarge(max);
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw tooLarge(max);
      chunks.push(value);
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks);
}

/**
 * Download an image the agent named by URL. Only public https hosts (no IP literals, ports or localhost), every
 * address the host resolves to must be public, and redirects are followed by hand so each hop passes the same checks
 * (the guards og:image fetching uses, `utils/og-image.ts`). Capped in size and time.
 */
export async function fetchForumImage(imageUrl: string): Promise<Buffer> {
  if (!isAllowedOgPageUrl(imageUrl)) {
    throw new BadRequestException(BAD_URL);
  }
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = imageUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await resolvePublicAddresses(current))) {
        throw new BadRequestException(BAD_URL);
      }
      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: abort.signal,
        headers: { Accept: 'image/*', 'User-Agent': USER_AGENT },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        const next = location ? new URL(location, current).href : '';
        if (!next || !isAllowedOgPageUrl(next)) {
          throw new BadRequestException(BAD_URL);
        }
        current = next;
        continue;
      }
      if (!response.ok) {
        throw new BadRequestException(`The image URL answered ${response.status}.`);
      }
      return await readCapped(response, FORUM_IMAGE_URL_MAX_BYTES);
    }
    throw new BadRequestException('The image URL redirected too many times.');
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    logger.warn(`Forum image download failed: ${String((error as Error)?.message ?? error)}`);
    throw new BadRequestException('The image could not be downloaded from that URL.');
  } finally {
    clearTimeout(timer);
  }
}

/** Alt text that can't break out of `![...]`. */
function markdownAlt(alt: unknown): string {
  return typeof alt === 'string'
    ? alt
        .replace(/[[\]\\]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

export function forumImageTools(images: ImageStore): McpToolDef[] {
  return [
    {
      name: 'upload_forum_image',
      description:
        'Upload an image for a LabOS forum post, stored the same way as an image added on the forum page. Give ' +
        'imageUrl (a public https image; LabOS keeps its own copy, up to 5 MB) or data (the image file as base64, up ' +
        'to 2 MB). JPEG, PNG, WebP or GIF. Returns url and markdown: put the markdown into the content of ' +
        'start_forum_thread, reply_to_forum_thread or edit_forum_post. Only upload what the member asked you to.',
      visibility: 'forum_write',
      inputSchema: {
        imageUrl: z.string().trim().max(IMAGE_URL_MAX).optional().describe('Public https URL of the image'),
        data: z.string().max(BASE64_MAX_CHARS).optional().describe('The image file as base64 (up to 2 MB)'),
        alt: z.string().trim().max(ALT_MAX).optional().describe('Alt text: what the image shows'),
      },
      execute: async (_ctx, args = {}) => {
        const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl.trim() : '';
        const data = typeof args.data === 'string' ? args.data : '';
        if (Boolean(imageUrl) === Boolean(data.trim())) {
          throw new BadRequestException('Give imageUrl or data (exactly one of them).');
        }
        const bytes = imageUrl ? await fetchForumImage(imageUrl) : decodeImageData(data);
        const mimeType = sniffImageType(bytes);
        if (!mimeType) {
          throw new BadRequestException(NOT_AN_IMAGE);
        }

        const file = {
          fieldname: 'file',
          originalname: `forum-image.${IMAGE_TYPES[mimeType]}`,
          encoding: '7bit',
          mimetype: mimeType,
          size: bytes.length,
          buffer: bytes,
        } as Express.Multer.File;
        const { image } = await images.upload(file);
        const url = image?.url;
        if (!url) {
          throw new BadRequestException('The image could not be stored. Try again.');
        }
        return {
          uploaded: {
            url,
            markdown: `![${markdownAlt(args.alt)}](${url})`,
            mimeType,
            size: bytes.length,
          },
        };
      },
    },
  ];
}
