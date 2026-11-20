/** A blank line: in markdown it ends the paragraph, so the next text part starts on its own line. */
export const TEXT_PART_BREAK = '\n\n';

/**
 * LAB-3362 D3: the line breaks to put between two text parts of one answer, the text before a tool call and the
 * text after it. The model writes each part with no break, so "…changes." and "Got your profile." were joined as
 * "…changes.Got your profile.". A single `\n` is a soft break in markdown and shows as a space, so the parts get a
 * blank line (`\n\n`). Line breaks that the parts already have count, so a part that ends or starts with a blank line
 * gets nothing more.
 */
export function textPartBreak(before: string, next: string): string {
  if (!before.trim() || !next) return '';
  const trailing = (before.match(/\s*$/)?.[0].match(/\n/g) ?? []).length;
  const leading = (next.match(/^\s*/)?.[0].match(/\n/g) ?? []).length;
  return '\n'.repeat(Math.max(0, TEXT_PART_BREAK.length - trailing - leading));
}
