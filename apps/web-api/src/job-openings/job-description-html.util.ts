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

/**
 * Greenhouse encodes posting HTML as entities (`&lt;p&gt;…`). sanitize-html
 * then treats the blob as a text node and we persist tags as text. Unwrap only
 * when the whole body is encoded — escaped tags, no raw ones — so a real
 * `<p>a &lt; b</p>` is left alone. `&amp;` last, one pass.
 */
const ESCAPED_TAG = /&lt;\s*\/?[a-z]/i;
const RAW_TAG = /<\/?[a-z][\s\S]*>/i;

export function decodeEntityEncodedHtml(html: string): string {
  if (!ESCAPED_TAG.test(html) || RAW_TAG.test(html)) return html;
  return html
    .replace(/&quot;|&#0*34;/g, '"')
    .replace(/&apos;|&#0*39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&');
}

export function sanitizeJobDescriptionHtml(html: string | null | undefined): string | null {
  if (typeof html !== 'string') return null;
  const trimmed = decodeEntityEncodedHtml(html.trim());
  if (!trimmed) return null;
  const sliced = trimmed.length > DESCRIPTION_HTML_MAX_CHARS ? trimmed.slice(0, DESCRIPTION_HTML_MAX_CHARS) : trimmed;
  const out = sanitizeHtml(sliced, SANITIZE_OPTIONS).trim();
  return out || null;
}
