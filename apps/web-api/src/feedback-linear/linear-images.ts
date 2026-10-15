import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { LinearClient } from './linear.client';

export const FEEDBACK_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const FEEDBACK_IMAGE_TIMEOUT_MS = 10_000;

export interface FeedbackImageSource {
  src: string;
  /** Preferred over `src`: the same picture with the member's drawing merged in. */
  flatSrc?: string;
}

/**
 * True only for https URLs on an allowed host (exact match, default port, no
 * credentials). Anything else is never fetched by the server.
 */
export function isAllowedImageUrl(url: string, allowedHosts: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) {
    return false;
  }
  return allowedHosts.includes(parsed.hostname.toLowerCase());
}

function filenameOf(url: string, index: number): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last.slice(-100);
  } catch {
    // fall through to the default name
  }
  return `screenshot-${index}.png`;
}

/** Copies feedback images into Linear's file storage so issues keep them. */
@Injectable()
export class LinearImageUploader {
  private readonly logger = new Logger(LinearImageUploader.name);
  private readonly http: AxiosInstance = axios.create();

  constructor(private readonly linear: LinearClient) {}

  /**
   * One markdown line per image, in order: an embedded Linear-hosted copy, or
   * a plain link to the URL when it is not allowed or the copy fails.
   */
  async rehost(images: FeedbackImageSource[], allowedHosts: string[]): Promise<string[]> {
    const lines: string[] = [];
    for (const [i, image] of images.entries()) {
      const index = i + 1;
      const url = image.flatSrc ?? image.src;
      const label = `Screenshot ${index}`;
      if (!isAllowedImageUrl(url, allowedHosts)) {
        lines.push(`[${label}](${url})`);
        continue;
      }
      try {
        const assetUrl = await this.copy(url, index);
        lines.push(`![${label}](${assetUrl})`);
      } catch (error) {
        this.logger.warn(`Could not copy feedback image ${index} to Linear: ${(error as Error).message}`);
        lines.push(`[${label}](${url})`);
      }
    }
    return lines;
  }

  private async copy(url: string, index: number): Promise<string> {
    const response = await this.http.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: FEEDBACK_IMAGE_TIMEOUT_MS,
      maxContentLength: FEEDBACK_IMAGE_MAX_BYTES,
      maxRedirects: 0,
    });
    const contentType = String(response.headers?.['content-type'] ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith('image/')) {
      throw new Error(`not an image (${contentType || 'no content type'})`);
    }
    const body = Buffer.from(response.data);
    if (body.length > FEEDBACK_IMAGE_MAX_BYTES) {
      throw new Error('image is larger than 10 MB');
    }
    const target = await this.linear.fileUpload(contentType, filenameOf(url, index), body.length);
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
    };
    for (const { key, value } of target.headers) headers[key] = value;
    await this.http.put(target.uploadUrl, body, {
      headers,
      timeout: FEEDBACK_IMAGE_TIMEOUT_MS,
      maxBodyLength: FEEDBACK_IMAGE_MAX_BYTES,
    });
    return target.assetUrl;
  }
}
