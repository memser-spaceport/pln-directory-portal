import DOMPurify from 'isomorphic-dompurify';
import { decodeHtmlEntities } from '../utils/html-entities';

export const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;

const DATA_URI_IMG = /<img\b[^>]*\bsrc=["']data:[^"']+["'][^>]*>/gi;
const ANY_IMG_SRC = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

export function looksLikeHtml(value: string): boolean {
  return /^\s*</.test(value);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function replaceDataUriImages(html: string, replacement: string): string {
  return html.replace(DATA_URI_IMG, replacement);
}

/** Drop inline data-URI images so we don't persist or email megabytes of base64. */
export function stripInlineDataImages(message: string | undefined): string | undefined {
  if (!message || !looksLikeHtml(message)) {
    return message;
  }
  return replaceDataUriImages(message, ' [image omitted] ');
}

/** Sanitize Quill HTML for email, or escape plain text (preserving newlines). */
export function toSupportEmailHtml(message: string): string {
  if (looksLikeHtml(message)) {
    return replaceDataUriImages(DOMPurify.sanitize(message), ' [image omitted] ');
  }
  return escapeHtml(message).replace(/\r\n|\n|\r/g, '<br>');
}

function telegramImageReplacement(_match: string, src: string): string {
  if (/^https?:\/\//i.test(src)) {
    return `\n${src}\n`;
  }
  return '\n[image]\n';
}

/** Strip tags for Telegram; keep hosted image URLs as their own lines. Plain text is unchanged. */
export function toSupportTelegramText(message: string): string {
  if (!looksLikeHtml(message)) {
    return message;
  }

  const withImages = message.replace(ANY_IMG_SRC, telegramImageReplacement);
  const stripped = withImages.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(stripped)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function clipTelegramText(text: string, max = TELEGRAM_MESSAGE_MAX_LENGTH): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}
