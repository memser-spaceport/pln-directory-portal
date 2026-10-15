import DOMPurify from 'isomorphic-dompurify';
import { decodeHtmlEntities } from '../utils/html-entities';

export const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;

const DATA_URI_IMG = /<img\b[^>]*\bsrc=["']data:[^"']+["'][^>]*>/gi;
const IMG_SRC_ATTR = /\bsrc=["']([^"']+)["']/i;
const HTML_TOKEN = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|[^<]+|</g;
const HREF_ATTR = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

/** Quill inline formats mapped onto the tags Telegram's HTML parse mode accepts. */
const TELEGRAM_INLINE_TAGS: Record<string, string> = {
  b: 'b',
  strong: 'b',
  i: 'i',
  em: 'i',
  u: 'u',
  s: 's',
  strike: 's',
  del: 's',
  code: 'code',
  pre: 'pre',
};

/** Closing one of these ends a line in Telegram. */
const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'tr']);

export function looksLikeHtml(value: string): boolean {
  return /^\s*</.test(value);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Escape text for a message sent with Telegram's `parse_mode: 'HTML'`. */
export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

/** Hosted images become their URL (Telegram previews it); anything else is a placeholder. */
function telegramImageText(tag: string): string {
  const src = IMG_SRC_ATTR.exec(tag)?.[1];
  return src && /^https?:\/\//i.test(src) ? escapeTelegramHtml(decodeHtmlEntities(src)) : '[image]';
}

function readHref(tag: string): string | undefined {
  const match = HREF_ATTR.exec(tag);
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!raw) {
    return undefined;
  }
  const href = decodeHtmlEntities(raw).trim();
  return SAFE_HREF.test(href) ? href : undefined;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Convert Quill HTML into the HTML subset Telegram's `parse_mode: 'HTML'` renders:
 * block elements become line breaks, links stay clickable, inline emphasis is kept,
 * hosted images become their URL and everything else is dropped. Text is re-escaped
 * so user-typed `<`/`&` cannot break Telegram's parser. Plain text is escaped as-is.
 */
export function toSupportTelegramHtml(message: string): string {
  if (!looksLikeHtml(message)) {
    return escapeTelegramHtml(message);
  }

  const open: string[] = [];
  let out = '';
  // An image owns its line: break before it, and before any text that follows it.
  let afterImage = false;
  const breakLine = () => {
    if (out && !out.endsWith('\n')) {
      out += '\n';
    }
  };

  for (const token of message.match(HTML_TOKEN) ?? []) {
    if (token[0] !== '<') {
      if (afterImage && token.trim()) {
        breakLine();
        afterImage = false;
      }
      out += escapeTelegramHtml(decodeHtmlEntities(token));
      continue;
    }

    const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(token);
    if (!tagMatch) {
      out += '&lt;';
      continue;
    }
    const closing = tagMatch[1] === '/';
    const name = tagMatch[2].toLowerCase();

    if (name === 'br') {
      out += '\n';
      afterImage = false;
      continue;
    }

    if (name === 'img') {
      breakLine();
      out += telegramImageText(token);
      afterImage = true;
      continue;
    }

    if (name === 'a') {
      if (!closing) {
        const href = readHref(token);
        if (href) {
          out += `<a href="${escapeHtml(href)}">`;
          open.push('a');
        } else {
          open.push('');
        }
      } else if (open.length && open[open.length - 1] === 'a') {
        open.pop();
        out += '</a>';
      } else if (open.length && open[open.length - 1] === '') {
        open.pop();
      }
      continue;
    }

    const inlineTag = TELEGRAM_INLINE_TAGS[name];
    if (inlineTag) {
      if (!closing) {
        out += `<${inlineTag}>`;
        open.push(inlineTag);
      } else if (open.length && open[open.length - 1] === inlineTag) {
        open.pop();
        out += `</${inlineTag}>`;
      }
    }

    if (BLOCK_TAGS.has(name)) {
      if (closing) {
        out += '\n';
        afterImage = false;
      } else if (name === 'li') {
        out += '• ';
      }
    }
  }

  out = out.trimEnd();
  while (open.length) {
    const tag = open.pop();
    if (tag) {
      out += `</${tag}>`;
    }
  }

  return normalizeWhitespace(out);
}

/** Tags left open by `html` (outermost first), so a clipped fragment can be closed. */
function unclosedTags(html: string): string[] {
  const open: string[] = [];
  for (const tag of html.match(/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/g) ?? []) {
    const match = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(tag);
    if (!match) {
      continue;
    }
    if (match[1] === '/') {
      if (open.length && open[open.length - 1] === match[2]) {
        open.pop();
      }
    } else {
      open.push(match[2]);
    }
  }
  return open;
}

/** Clip to Telegram's limit without leaving a half-written or unclosed tag behind. */
export function clipTelegramText(text: string, max = TELEGRAM_MESSAGE_MAX_LENGTH): string {
  if (text.length <= max) {
    return text;
  }
  const clipped = text.slice(0, max - 1).replace(/<[^>]*$/, '');
  const closers = unclosedTags(clipped)
    .reverse()
    .map((tag) => `</${tag}>`)
    .join('');
  return `${clipped}…${closers}`;
}

const FLAT_SRC_ATTR = /\sdata-flat-src=["']([^"']+)["']/i;
/** `src` as its own attribute; `\bsrc=` would also match inside `data-flat-src=`. */
const OWN_SRC_ATTR = /\ssrc=["']([^"']+)["']/i;
const MARKDOWN_SPECIAL = /[\\`*_[\]<>#~|]/g;
const HEADING_TAG = /^h([1-6])$/;
/** Inline tags mapped to the markdown marker that wraps them. */
const MARKDOWN_INLINE_MARKS: Record<string, string> = {
  b: '**',
  strong: '**',
  i: '_',
  em: '_',
  s: '~~',
  strike: '~~',
  del: '~~',
  code: '`',
};

export interface FeedbackImage {
  /** The uploaded image as the member sent it. */
  src: string;
  /** A copy with the member's drawing merged in, when the client uploaded one. */
  flatSrc?: string;
}

export interface FeedbackMarkdown {
  markdown: string;
  /** http(s) images in the order they appear; not included in `markdown`. */
  images: FeedbackImage[];
}

export function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIAL, (char) => `\\${char}`);
}

function readImage(tag: string): FeedbackImage | null {
  const src = OWN_SRC_ATTR.exec(tag)?.[1];
  if (!src) return null;
  const decoded = decodeHtmlEntities(src).trim();
  if (!/^https?:\/\//i.test(decoded)) return null;
  const flat = FLAT_SRC_ATTR.exec(tag)?.[1];
  const flatSrc = flat ? decodeHtmlEntities(flat).trim() : '';
  return /^https?:\/\//i.test(flatSrc) ? { src: decoded, flatSrc } : { src: decoded };
}

/**
 * Convert Quill HTML into markdown for a Linear issue: emphasis, links (http,
 * https and mailto only), headings, list items and line breaks are kept; other
 * markup is dropped and text is escaped. Images are returned separately so the
 * caller can re-host them. A plain-text message is returned as is.
 */
export function toLinearMarkdown(message: string): FeedbackMarkdown {
  if (!looksLikeHtml(message)) {
    return { markdown: message.trim(), images: [] };
  }

  const html = DOMPurify.sanitize(message);
  const images: FeedbackImage[] = [];
  // Each open `<a>` keeps its href (or null when it was unsafe) and the text written inside it.
  const links: { href: string | null; start: number }[] = [];
  let out = '';
  const breakBlock = () => {
    out = out.replace(/[ \t]+$/, '');
    if (out && !out.endsWith('\n\n')) out += out.endsWith('\n') ? '\n' : '\n\n';
  };

  for (const token of html.match(HTML_TOKEN) ?? []) {
    if (token[0] !== '<') {
      out += escapeMarkdown(decodeHtmlEntities(token));
      continue;
    }
    const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(token);
    if (!tagMatch) {
      out += '\\<';
      continue;
    }
    const closing = tagMatch[1] === '/';
    const name = tagMatch[2].toLowerCase();

    if (name === 'br') {
      out += '\n';
      continue;
    }
    if (name === 'img') {
      const image = readImage(token);
      if (image) images.push(image);
      continue;
    }
    if (name === 'a') {
      if (!closing) {
        links.push({ href: readHref(token) ?? null, start: out.length });
      } else {
        const link = links.pop();
        if (link?.href) {
          const text = out.slice(link.start).trim() || escapeMarkdown(link.href);
          out = `${out.slice(0, link.start)}[${text}](${encodeLinkTarget(link.href)})`;
        }
      }
      continue;
    }
    const mark = MARKDOWN_INLINE_MARKS[name];
    if (mark) {
      out += mark;
      continue;
    }
    const heading = HEADING_TAG.exec(name);
    if (heading) {
      if (closing) breakBlock();
      else {
        breakBlock();
        out += `${'#'.repeat(Math.min(Number(heading[1]), 3))} `;
      }
      continue;
    }
    if (name === 'li') {
      if (closing) out += '\n';
      else {
        if (out && !out.endsWith('\n')) out += '\n';
        out += '- ';
      }
      continue;
    }
    if (BLOCK_TAGS.has(name) || name === 'ul' || name === 'ol') {
      if (closing) breakBlock();
    }
  }

  return { markdown: normalizeMarkdown(out), images };
}

/** Parentheses and spaces would end a markdown link target early. */
function encodeLinkTarget(href: string): string {
  return href.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20');
}

function normalizeMarkdown(text: string): string {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The message as plain text lines (tags dropped, entities decoded), for titles. */
export function toPlainText(message: string): string {
  if (!looksLikeHtml(message)) {
    return message.trim();
  }
  let out = '';
  for (const token of DOMPurify.sanitize(message).match(HTML_TOKEN) ?? []) {
    if (token[0] !== '<') {
      out += decodeHtmlEntities(token);
      continue;
    }
    const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(token);
    if (!tagMatch) {
      out += '<';
      continue;
    }
    const name = tagMatch[2].toLowerCase();
    if (name === 'br' || (tagMatch[1] === '/' && (BLOCK_TAGS.has(name) || HEADING_TAG.test(name)))) {
      out += '\n';
    }
  }
  return normalizeWhitespace(out);
}
