/**
 * LAB-3362 D4: a fixed answer line that replaces the model text of a turn while a condition holds. The LabOS agent
 * uses it for an intro draft: the draft text is only in the draft card, and the answer is one short line.
 *
 * `line` is read for each text chunk. While it gives a line, the stream drops the model text. The line itself goes
 * out only when the turn ends (`finish`) and `line` still gives it, so the answer has the line only when a draft card
 * goes out. When `line` gives nothing again (for example a refused second `draft_intro` call removed the draft), the
 * model text streams again, so the member sees the refusal and no line.
 *
 * LAB-3367 F6: with `reserved` (the same line), model text is never that line while the override is off. The filter
 * removes the line from the model text, also when it comes in more than one chunk: it holds back the end of the text
 * while that end can be the start of the line. The held text stays across an initial generation and its continuation. `flush` gives it once, when all generations end.
 */
export class AnswerOverride {
  /** True after the override dropped text, until the next text that streams. */
  private dropped = false;

  /** LAB-3367 F6: model text held back, because it can be the start of `reserved`. */
  private held = '';

  constructor(private readonly line?: () => string | undefined, private readonly reserved?: string) {}

  /** True while the override replaces the answer text. */
  isOn(): boolean {
    return Boolean(this.line?.());
  }

  /** The text to stream for `chunk`. `written` is the answer text of the turn so far. */
  filter(chunk: string, written: string): string {
    if (this.isOn()) {
      if (chunk || this.held) this.dropped = true;
      this.held = '';
      return '';
    }
    if (!this.dropped) return this.withoutReserved(chunk);
    // The break before the text came with the dropped text. At the start of the answer the text needs none.
    const next = written.trim() ? chunk : chunk.replace(/^\s+/, '');
    if (next) this.dropped = false;
    return this.withoutReserved(next);
  }

  /** LAB-3367 F6: the held text after all generations, or ''. While the override is on, the held text is dropped. */
  flush(): string {
    const out = this.isOn() ? '' : this.held;
    this.held = '';
    return out;
  }

  /** LAB-3367 F6: `chunk` after the held text, without `reserved`. The end that can start `reserved` is held back. */
  private withoutReserved(chunk: string): string {
    if (!this.reserved) return chunk;
    const text = (this.held + chunk).split(this.reserved).join('');
    let keep = Math.min(text.length, this.reserved.length - 1);
    while (keep > 0 && !this.reserved.startsWith(text.slice(text.length - keep))) keep -= 1;
    this.held = text.slice(text.length - keep);
    return text.slice(0, text.length - keep);
  }

  /** The line to add when the turn ends with the override on, or ''. */
  finish(written: string): string {
    const line = this.line?.();
    return line ? breakBefore(written) + line : '';
  }
}

/** A blank line after earlier answer text, so the line is its own markdown paragraph. Line breaks already there count. */
function breakBefore(written: string): string {
  if (!written.trim()) return '';
  const trailing = (written.match(/\s*$/)?.[0].match(/\n/g) ?? []).length;
  return '\n'.repeat(Math.max(0, 2 - trailing));
}
