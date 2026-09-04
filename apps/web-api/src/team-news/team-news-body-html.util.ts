import sanitizeHtml from 'sanitize-html';

export const TEAM_NEWS_BODY_MAX_PLAIN_CHARS = 2000;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'strong', 'em', 'b', 'i', 'a', 'ul', 'ol', 'li', 'br'],
  allowedAttributes: {
    a: ['href'],
  },
  allowedSchemes: ['http', 'https'],
};

export function sanitizeTeamNewsBodyHtml(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  const sanitized = sanitizeHtml(input.trim(), SANITIZE_OPTIONS).trim();
  return hasRichTextContent(sanitized) ? sanitized : null;
}

export function hasRichTextContent(html: string | null | undefined): boolean {
  if (!html?.trim()) return false;
  const text = stripHtmlToPlainText(html);
  return text.length > 0;
}

export function stripHtmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSafeHttpUrl(raw: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(raw.trim()).protocol);
  } catch {
    return false;
  }
}
