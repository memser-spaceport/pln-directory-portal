import DOMPurify from 'isomorphic-dompurify';
import { decodeHtmlEntities } from '../utils/html-entities';

export function looksLikeHtml(value: string): boolean {
  return /^\s*</.test(value);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Sanitize Quill HTML for email, or escape plain text (preserving newlines). */
export function toSupportEmailHtml(message: string): string {
  if (looksLikeHtml(message)) {
    return DOMPurify.sanitize(message);
  }
  return escapeHtml(message).replace(/\r\n|\n|\r/g, '<br>');
}

/** Strip tags for Telegram; keep image URLs as their own lines. Plain text is unchanged. */
export function toSupportTelegramText(message: string): string {
  if (!looksLikeHtml(message)) {
    return message;
  }

  const withImages = message.replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, '\n$1\n');
  const stripped = withImages.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(stripped)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
