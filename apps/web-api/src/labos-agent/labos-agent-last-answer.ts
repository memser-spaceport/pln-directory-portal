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
 * LAB-3367 F1, F3, K3: the literal phrases that name the agent's own previous reply. They match only as whole words,
 * in any letter case. This is a narrow check for the agreed examples, not a language guess: other words for the same
 * request go to the model, with the prompt rules.
 */
const OWN_REPLY_PHRASE = /\byour\s+(?:last|latest|previous)\s+(?:answers?|repl(?:y|ies)|responses?)\b/i;

/** LAB-3367 o5, p3: "what you said", "what you just said", "what you wrote" or "what you just wrote". */
const WHAT_YOU_SAID = /\bwhat\s+you\s+(?:just\s+)?(?:said|wrote)\b/gi;

/**
 * LAB-3367 p3: a content verb. Before "what you said" in the same sentence, with no "to" between, the phrase is content
 * for the draft ("add what you said about Lit to it"), not the reply to change.
 */
const LAST_CONTENT_VERB = /^[\s\S]*\b(?:add|put|use|include|mention|tell|say|write|with)\b([\s\S]*)$/i;

/** LAB-3367 o3: the words that name the intro draft, also in the plural. */
const DRAFT_WORDS = String.raw`(?:drafts?|intros?|introductions?|cards?)`;

/**
 * LAB-3367 p1: one or more draft words, for example "the intro draft" or "the draft or the card". The words between
 * are "or", "and", "the", "my", "this" and "request".
 */
const DRAFT_PHRASE = String.raw`${DRAFT_WORDS}(?:\s+(?:(?:or|and)\s+)?(?:(?:the|my|this)\s+)?(?:request|${DRAFT_WORDS})\b)*`;

/** A message with one of these words can point to the draft, for example "add your last answer to the card". */
const DRAFT_WORD = new RegExp(String.raw`\b${DRAFT_WORDS}\b`, 'i');

/**
 * LAB-3367 o3, p1, p2: draft words that do not point to the draft, so the check removes them before it looks for a
 * draft word. At most 3 words come between the first word and the draft words.
 * - After "not", "don't" (also "dont"), "do not", "never", "without" or "instead of": "not the intro draft", "never
 *   touch the draft". "don't make" and "do not make" do not count: "do not make the draft longer" is a draft edit.
 * - After "keep" or "leave", only at the end of the clause or before "as", "alone" or "unchanged": "keep the intro
 *   card", "leave the intro as it is". "keep the intro short" is a draft edit.
 */
const NEGATED_DRAFT_WORD = new RegExp(
  String.raw`\b(?:(?:not|don['’]?t|never)(?!\s+make\b)|without|instead\s+of)\b(?:\s+[\w'’]+){0,3}?\s+${DRAFT_PHRASE}\b` +
    String.raw`|\b(?:keep|leave)\b(?:\s+[\w'’]+){0,3}?\s+${DRAFT_PHRASE}\b(?=\s*(?:$|[.,;:!?]|(?:as|alone|unchanged)\b))`,
  'gi'
);

/**
 * LAB-3367 o3, p4: the change words. Only a message with one of them gets the fixed answer when the latest reply is
 * not known, for example "shorten your last answer". "Your last answer did not load. What is new in LabOS?" has none.
 * "cut" does not count after "was" or "got", or before "off" or "short": "your last answer was cut off" tells what
 * happened.
 */
const CHANGE_WORD =
  /\b(?:shorten|shorter|rewrite|reword|rephrase|change|edit|revise|fix|add|remove|delete|expand|longer|simplify|summari[sz]e|condense|trim)\b|(?<!\b(?:was|got)\s+)\bcut\b(?!\s+(?:off|short)\b)|\btoo\s+long\b/i;

/** LAB-3367 p3: true when one "what you said" in `message` names the previous reply, not content for the draft. */
function saysWhatYouSaid(message: string): boolean {
  for (const match of message.matchAll(WHAT_YOU_SAID)) {
    // Only the same sentence counts: the text after the last ".", "!" or "?" before the phrase.
    const before = message.slice(0, match.index).split(/[.!?]/).pop() ?? '';
    // The text after the last content verb, or none. A "to" there points to the reply as the target to change.
    const after = LAST_CONTENT_VERB.exec(before)?.[1];
    if (after === undefined || /\bto\b/i.test(after)) return true;
  }
  return false;
}

/**
 * True when `message` names the agent's own previous reply and does not name a draft, an intro or a card. A negated
 * or kept draft word ("not the draft", "keep the card") does not count.
 */
export function namesOwnLastAnswer(message: string): boolean {
  if (!OWN_REPLY_PHRASE.test(message) && !saysWhatYouSaid(message)) return false;
  return !DRAFT_WORD.test(message.replace(NEGATED_DRAFT_WORD, ' '));
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
