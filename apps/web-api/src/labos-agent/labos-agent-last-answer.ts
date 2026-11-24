import { INTRO_DRAFT_LINE } from './labos-agent-drafts';

/**
 * LAB-3367 F1, F3, K3, o2: the fixed answer when the member asks to change "your last answer", an intro draft card
 * waits, and the latest reply is not known or is this same answer. The request is stored nowhere, so the answer asks
 * for the full request again. It asks no open question. The draft stays unchanged.
 */
export const WHICH_REPLY_LINE =
  'I cannot tell which reply to change, so I changed nothing. Send the full request again: say ' +
  '"make the draft shorter" for the intro draft, or paste the text to change.';

/**
 * LAB-3367 F1, F3, K3, o5: the literal phrases that name the agent's own previous reply. They match only as whole
 * words, in any letter case. This is a narrow check for the agreed examples, not a language guess: other words for the
 * same request go to the model, with the prompt rules.
 */
const OWN_REPLY_PHRASE =
  /\byour\s+(?:last|latest|previous)\s+(?:answers?|repl(?:y|ies)|responses?)\b|\bwhat\s+you\s+(?:just\s+)?(?:said|wrote)\b/i;

/** LAB-3367 o3: the words that name the intro draft, also in the plural. */
const DRAFT_WORDS = String.raw`(?:drafts?|intros?|introductions?|cards?)`;

/** A message with one of these words can point to the draft, for example "add your last answer to the card". */
const DRAFT_WORD = new RegExp(String.raw`\b${DRAFT_WORDS}\b`, 'i');

/**
 * LAB-3367 o3: a draft word after "not", "don't", "do not", "leave", "keep" or "without", with at most 3 words between,
 * for example "not the draft", "but don't change the draft" or "leave the intro as it is". It does not point to the
 * draft, so the check removes it before it looks for a draft word.
 */
const NEGATED_DRAFT_WORD = new RegExp(
  String.raw`\b(?:not|don['’]t|do\s+not|leave|keep|without)\b(?:\s+[\w'’]+){0,3}?\s+${DRAFT_WORDS}\b`,
  'gi'
);

/**
 * LAB-3367 o3: the change words. Only a message with one of them gets the fixed answer when the latest reply is not
 * known, for example "shorten your last answer". "Your last answer did not load. What is new in LabOS?" has none.
 */
const CHANGE_WORD =
  /\b(?:shorten|shorter|rewrite|reword|rephrase|change|edit|revise|fix|update|add|remove|delete|expand|longer|simplify|summari[sz]e|condense|trim|cut)\b|\btoo\s+long\b/i;

/**
 * True when `message` names the agent's own previous reply and does not name a draft, an intro or a card. A negated
 * draft word ("not the draft") does not count.
 */
export function namesOwnLastAnswer(message: string): boolean {
  return OWN_REPLY_PHRASE.test(message) && !DRAFT_WORD.test(message.replace(NEGATED_DRAFT_WORD, ' '));
}

/**
 * LAB-3367 F1, F3, K3, o3: how a C1 turn handles a message that names "your last answer".
 * - 'model': no change. No card waits, the message does not name the last answer, or the latest reply is the draft
 *   line (`INTRO_DRAFT_LINE`), so a revision of the card is correct.
 * - 'answer': the turn has no `draft_intro` tool, no card text and no intro hints. The latest reply is a normal
 *   answer, or it is not known and the message has no change word.
 * - 'which': the latest reply is not known ('') or is `WHICH_REPLY_LINE`, and the message has a change word. The turn
 *   also gets the fixed answer `WHICH_REPLY_LINE`.
 */
export function lastAnswerTurn(message: string, hasCard: boolean, latestReply: string): 'model' | 'answer' | 'which' {
  if (!hasCard || !namesOwnLastAnswer(message)) return 'model';
  const reply = latestReply.trim();
  if (reply === INTRO_DRAFT_LINE) return 'model';
  if ((!reply || reply === WHICH_REPLY_LINE) && CHANGE_WORD.test(message)) return 'which';
  return 'answer';
}

/** LAB-3367 o1: `text` without each intro hint, so a turn with no `draft_intro` tool has no text that names it. */
export function withoutIntroHints(text: string | undefined, hints: readonly string[]): string | undefined {
  if (!text) return text;
  return hints.reduce((out, hint) => out.split(hint).join(''), text) || undefined;
}
