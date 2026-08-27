import sanitizeHtml from 'sanitize-html';

export const DESCRIPTION_HTML_MAX_CHARS = 200_000;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'b',
    'i',
    'a',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'span',
  ],
  allowedAttributes: {
    a: ['href'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
};

export function sanitizeJobDescriptionHtml(html: string | null | undefined): string | null {
  if (typeof html !== 'string') return null;
  const trimmed = html.trim();
  if (!trimmed) return null;
  const sliced = trimmed.length > DESCRIPTION_HTML_MAX_CHARS ? trimmed.slice(0, DESCRIPTION_HTML_MAX_CHARS) : trimmed;
  const out = sanitizeHtml(sliced, SANITIZE_OPTIONS).trim();
  return out || null;
}
