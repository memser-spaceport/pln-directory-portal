import { toPlainText } from '../contact-support/contact-support-html';

/** Shared pieces of a feedback issue's text, for every source. */

const TITLE_MAX_LENGTH = 80;
export const FEEDBACK_CONTEXT_MAX_LENGTH = 2000;
export const FEEDBACK_EXPECTED_RESULT_SECTION = '## Expected result\n\n_Fill in during triage before moving to Todo._';
/** Linear priorities: 1 Urgent, 2 High, 3 Medium, 4 Low. */
const PRIORITY_BY_LEVEL: Record<string, number> = { P0: 1, P1: 2, P2: 3, P3: 4 };

/** `<prefix> <first non-empty line as plain text, ≤ 80 chars>`, or `<prefix> <fallback>` for an empty message. */
export function feedbackIssueTitle(message: string, fallback: string, prefix = '[Feedback]'): string {
  const firstLine =
    toPlainText(message)
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '';
  const text = firstLine || fallback;
  const clipped = text.length > TITLE_MAX_LENGTH ? `${text.slice(0, TITLE_MAX_LENGTH - 1)}…` : text;
  return `${prefix} ${clipped}`;
}

/** Replaces the reporter's email, also when markdown escaping put backslashes inside it. */
export function hideEmail(text: string, email: string | null | undefined): string {
  if (!email) return text;
  const pattern = [...email].map((char) => `\\\\?${char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).join('');
  return text.replace(new RegExp(pattern, 'gi'), '[email hidden]');
}

/** P0–P3 as a Linear priority, or undefined when the item has none. */
export function feedbackPriority(level: unknown): number | undefined {
  return typeof level === 'string' ? PRIORITY_BY_LEVEL[level] : undefined;
}

/** `## Context` with the context as JSON, truncated; null when there is none. */
export function feedbackContextSection(context: unknown): string | null {
  if (!context || typeof context !== 'object') return null;
  const json = JSON.stringify(context, null, 2).slice(0, FEEDBACK_CONTEXT_MAX_LENGTH);
  return `## Context\n\n\`\`\`json\n${json}\n\`\`\``;
}
