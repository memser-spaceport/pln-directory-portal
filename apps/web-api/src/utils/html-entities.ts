/**
 * Decodes the HTML entities that reach us in stored rich text.
 *
 * Two sources produce them: LLM-authored HTML (Husky's Member.bio) and the Quill
 * editor, which re-encodes quotes and ampersands on save. Anywhere that rich text
 * is flattened to plain text for display — a draft note, a push-notification
 * description — the entities must be decoded, or the user reads a literal
 * `&quot;`.
 *
 * `&amp;` MUST be decoded LAST. Decoding it first turns a legitimately
 * double-encoded `&amp;quot;` into `"` instead of the `&quot;` the source
 * actually says.
 *
 * Callers should strip tags BEFORE calling this. Decoding first would turn an
 * escaped `&lt;b&gt;` into a real tag that a later strip pass would then eat.
 */
export const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&quot;|&#0*34;/g, '"')
    .replace(/&apos;|&#0*39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&');
