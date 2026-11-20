/**
 * LAB-3362 D4: a fixed answer line that replaces the model text of a turn while a condition holds. The LabOS agent
 * uses it for an intro draft: the draft text is only in the draft card, and the answer is one short line.
 *
 * `line` is read for each text chunk. While it gives a line, the stream shows that line once and drops the model
 * text. When it gives nothing again (for example a refused second `draft_intro` call removed the draft), the model
 * text streams again.
 */
export class AnswerOverride {
  private shown = false;

  constructor(private readonly line?: () => string | undefined) {}

  /** True while the override replaces the answer text. */
  isOn(): boolean {
    return Boolean(this.line?.());
  }

  /** The text to stream for `chunk`. `written` is the answer text of the turn so far. */
  filter(chunk: string, written: string): string {
    const line = this.line?.();
    if (!line) return chunk;
    if (this.shown) return '';
    this.shown = true;
    return breakBefore(written) + line;
  }

  /** The line to add when the turn ends and the line is not shown yet, or ''. */
  finish(written: string): string {
    return this.filter('', written);
  }
}

/** A blank line after earlier answer text, so the line is its own markdown paragraph. Line breaks already there count. */
function breakBefore(written: string): string {
  if (!written.trim()) return '';
  const trailing = (written.match(/\s*$/)?.[0].match(/\n/g) ?? []).length;
  return '\n'.repeat(Math.max(0, 2 - trailing));
}
