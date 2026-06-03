/**
 * Shape validators shared between the field-shape gate (judgability) and the
 * quality scorer (validity dimension). Structural checks only — they don't
 * verify content, only that the value LOOKS like the right kind of thing.
 */

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(v.trim());
}

export function looksLikeEmail(v: string): boolean {
  return /@/.test(v) && !v.startsWith('http');
}

export function emailDomain(value: string): string | null {
  const m = value.trim().toLowerCase().match(/^[^\s@]+@([^\s@]+)$/);
  return m ? m[1] : null;
}
