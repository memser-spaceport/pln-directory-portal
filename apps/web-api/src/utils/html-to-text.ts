import sanitizeHtml from 'sanitize-html';

// sanitize-html decodes entities on parse but re-escapes &, <, > in its
// output (it assumes the output will be re-embedded as HTML), so a second
// decode pass is needed to get real plain text.
const RESIDUAL_ENTITIES: Array<[RegExp, string]> = [
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#0*39;|&apos;/g, "'"],
];

// sanitize-html inserts no whitespace when it strips block-level tags
// (`<p>Para1</p><p>Para2</p>` -> "Para1Para2"), so those boundaries need an
// explicit space before stripping or adjacent words run together.
const BLOCK_BOUNDARY_TAGS = /<\/?(p|div|br|li|ul|ol|h[1-6]|blockquote|tr)[^>]*>/gi;

export function stripHtmlToPlainText(html: string): string {
  if (!html) return '';
  const withBoundaries = html.replace(BLOCK_BOUNDARY_TAGS, ' ');
  const stripped = sanitizeHtml(withBoundaries, { allowedTags: [], allowedAttributes: {} });
  return RESIDUAL_ENTITIES.reduce((acc, [re, repl]) => acc.replace(re, repl), stripped)
    .replace(/\s+/g, ' ')
    .trim();
}
