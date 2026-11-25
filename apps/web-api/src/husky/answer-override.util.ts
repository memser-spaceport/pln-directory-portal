/**
 * LAB-3362 D4: a fixed answer line that replaces the model text of a turn while a condition holds. The LabOS agent
 * uses it for an intro draft: the draft text is only in the draft card, and the answer is one short line.
 *
 * `line` is read for each text chunk. While it gives a line, the stream drops the model text. The line itself goes
 * out only when the turn ends (`finish`) and `line` still gives it, so the answer has the line only when a draft card
 * goes out. When `line` gives nothing again (for example a refused second `draft_intro` call removed the draft), the
 * model text streams again, so the member sees the refusal and no line.
 *
 * LAB-3367 F6, t7: with `reserved` (the same line and its other forms), model text is never one of these lines while
 * the override is off. The filter removes each line, plain or in balanced bold (`**line**` or `__line__`), and also
 * when it comes in more than one chunk. It reads the text from left to right and tries the longest form first. When
 * the text ends inside a form, it holds back that end, so a bold form is not cut to the plain line when the closing
 * marks come in the next chunk. The held text stays across an initial generation and its continuation (`held`), and
 * `flush` gives it once, when all generations end. Other text, also other bold or italic marks, does not change.
 *
 * LAB-3367 G3: with `reserved`, the first text with no letter or digit (for example `**` or `.`) is also held until
 * text with a letter or digit comes. At the end, it goes out only when the filter removed no line.
 */
export class AnswerOverride {
  /** True after the override dropped text, until the next text that streams. */
  private dropped = false;

  /** LAB-3367 F6: model text held back, because it can be the start of `reserved`. */
  private heldText = '';

  /** LAB-3367 G3: the first output with no letter or digit, held until text with a letter or digit comes. */
  private leadText = '';

  /** LAB-3367 G3: true after output with a letter or digit. */
  private started = false;

  /** LAB-3367 G3: true after the filter removed a line. */
  private removed = false;

  /** LAB-3367 t7b: each reserved line, plain and in balanced bold, longest first. */
  private readonly forms: string[];

  constructor(private readonly line?: () => string | undefined, reserved: readonly string[] = []) {
    this.forms = [...new Set(reserved.filter(Boolean))]
      .flatMap((form) => [`**${form}**`, `__${form}__`, form])
      .sort((a, b) => b.length - a.length);
  }

  /** LAB-3367 t7a: the model text that the filter holds back now, without the lines. It is part of the answer so far. */
  held(): string {
    return this.leadText + this.scan(this.heldText, true, false).out;
  }

  /** LAB-3367 G3: true after the filter removed a reserved line from the model text. */
  removedLine(): boolean {
    return this.removed;
  }

  /** True while the override replaces the answer text. */
  isOn(): boolean {
    return Boolean(this.line?.());
  }

  /** The text to stream for `chunk`. `written` is the answer text of the turn so far. */
  filter(chunk: string, written: string): string {
    if (this.isOn()) {
      if (chunk || !/^[*_]*$/.test(this.heldText)) this.dropped = true;
      return this.takeLead() + this.heldMarks();
    }
    if (!this.dropped) return this.lead(this.withoutReserved(chunk));
    // The break before the text came with the dropped text. At the start of the answer the text needs none.
    const next = written.trim() ? chunk : chunk.replace(/^\s+/, '');
    if (next) this.dropped = false;
    return this.lead(this.withoutReserved(next));
  }

  /** LAB-3367 F6: the held text after all generations, or ''. While the override is on, only held marks stay (u4). */
  flush(): string {
    if (this.isOn()) return this.takeLead() + this.heldMarks();
    const out = this.lead(this.scan(this.heldText, true).out);
    this.heldText = '';
    // G3: a first text with no letter or digit goes out only when the filter removed no line.
    const lead = this.removed ? '' : this.leadText;
    this.leadText = '';
    return out + lead;
  }

  /** LAB-3367 G3: `out`, or '' while the output has no letter or digit yet. Then `out` is held in `leadText`. */
  private lead(out: string): string {
    if (this.started || !this.forms.length || !out) return out;
    if (!/[\p{L}\p{N}]/u.test(out)) {
      this.leadText += out;
      return '';
    }
    this.started = true;
    return this.takeLead() + out;
  }

  /** LAB-3367 G3: the held first text, once. */
  private takeLead(): string {
    const out = this.leadText;
    this.leadText = '';
    return out;
  }

  /**
   * LAB-3367 u4: while the override is on, the held text goes. Only held text that is all marks (`*`, `**`, `_` or
   * `__` right before the `draft_intro` call) stays, because it is text before the tool call, not a start of the line.
   */
  private heldMarks(): string {
    const out = /^[*_]+$/.test(this.heldText) ? this.heldText : '';
    this.heldText = '';
    return out;
  }

  /** LAB-3367 F6: `chunk` after the held text, without the lines. The end that can start a line is held back. */
  private withoutReserved(chunk: string): string {
    if (!this.forms.length) return chunk;
    const { out, held } = this.scan(this.heldText + chunk, false);
    this.heldText = held;
    return out;
  }

  /**
   * LAB-3367 t7: `text` without the forms, from left to right. When `final` is false, the end of `text` that can
   * still become a form is held. When `final` is true, nothing is held.
   */
  private scan(text: string, final: boolean, trackRemoval = true): { out: string; held: string } {
    let out = '';
    let i = 0;
    while (i < text.length) {
      const match = this.matchAt(text, i, final);
      if (match === 'partial') return { out, held: text.slice(i) };
      if (match > 0) {
        if (trackRemoval) this.removed = true;
        i += match;
        continue;
      }
      out += text[i];
      i += 1;
    }
    return { out, held: '' };
  }

  /**
   * The length of the longest form at `i`, or 0. 'partial' when the text ends inside a form that is longer than any
   * complete form at `i`, so a bold form goes before its plain line. Each check reads at most one form length.
   */
  private matchAt(text: string, i: number, final: boolean): number | 'partial' {
    const left = text.length - i;
    for (const form of this.forms) {
      if (text.startsWith(form, i)) return form.length;
      if (!final && left < form.length && form.startsWith(text.slice(i))) return 'partial';
    }
    return 0;
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
