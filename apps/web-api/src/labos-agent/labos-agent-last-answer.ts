import { INTRO_DRAFT_LINE } from './labos-agent-drafts';

/**
 * LAB-3367 F1, F3, K3, o2: the fixed answer when the member asks to change "your last answer", an intro draft card
 * waits, and the latest reply is not known or is this same answer. The request is stored nowhere. The answer tells how
 * to change the draft and asks no open question. It does not ask for a pasted text: "shorten this: <text>" changed the
 * draft in QA (review item 4). The draft stays unchanged.
 */
export const WHICH_REPLY_LINE =
  'I cannot tell which reply to change, so I changed nothing. To change the intro draft, say “make the draft shorter”.';

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

/** LAB-3367 p3, s3: after the content verb, "to" or a revision verb points to the reply as the target to change. */
const REVISION_AFTER_CONTENT =
  /\b(?:to|shorten|rewrite|reword|rephrase|change|edit|revise|simplify|summari[sz]e|condense|trim|cut)\b/i;

/**
 * LAB-3367 s1, t5, u3: the verbs after "and", "but" or "then" that end a keep or leave clause: "keep the draft and
 * shorten ...". "make", "change", "edit" and "fix" count only before "your" (also "only your" or "just your"). "keep the
 * draft and add your last answer to it" is a draft edit.
 */
const CHANGE_VERBS = String.raw`(?:shorten|rewrite|reword|rephrase|revise|expand|simplify|summari[sz]e|condense|trim|cut|translate|redo|(?:make|change|edit|fix)\s+(?:(?:only|just)\s+)?your)`;

/**
 * LAB-3367 u3: a change of the previous reply, later in the same sentence. "add" or "put" needs "to your last answer"
 * ("add a list to your last answer"). "remove" or "delete" needs "of", "from" or "in your last answer" ("remove the last
 * line of your last answer"). "add your last answer to it" and "add a line from your last answer" are draft edits.
 */
const YOUR_REPLY = String.raw`your\s+(?:last|latest|previous)\s+(?:answers?|repl(?:y|ies)|responses?)\b`;
const REPLY_EDIT = String.raw`(?:(?:add|put)\b[^.!?\n]*?\bto\s+${YOUR_REPLY}|(?:remove|delete)\b[^.!?\n]*?\b(?:of|from|in)\s+${YOUR_REPLY})`;

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
 *   touch the draft", "don't make a new draft" (s2). "make" (also with "the", "my" or "this") before draft words and
 *   one more word that is not "again" does not count: "do not make the draft longer" is a draft edit.
 * - After "keep" or "leave", only at the end of the clause (s1): the end of the text, a line break, a punctuation mark,
 *   a bracket or a dash; before "alone", "unchanged", "untouched", "intact", "the same", "like it", "please", "for
 *   now", "as-is", "as it", "as is" or "as they" (also after "exactly"); or before optional "and" or "but", optional
 *   "then", optional "please", "just" or "only", and a change verb (`CHANGE_VERBS`), or "add", "remove", "delete" or
 *   "put" with "to your last answer", or "remove" or "delete" with "of / from / in your last answer", later in the
 *   sentence (`REPLY_EDIT`, Group A, u3).
 * - "don't make the draft now" and "... yet" count like "again" (Group A).
 *   "keep the intro short" and "keep the intro as short as it is" are draft edits.
 */
const DRAFT_EDIT_AFTER_MAKE = String.raw`\s+make\s+(?:(?:the|my|this)\s+)?${DRAFT_PHRASE}\s+(?!(?:again|now|yet)\b)[\w'’]+`;
const KEEP_CLAUSE_END =
  String.raw`(?=[^\S\n]*(?:$|[\n.,;:!?()[\]{}\-–—]|(?:exactly\s+)?(?:alone|unchanged|untouched|intact|the\s+same|like\s+it|please|for\s+now|as-is|as\s+(?:it|is|they))\b` +
  String.raw`|(?:(?:and|but)\s+)?(?:then\s+)?(?:(?:please|just|only)\s+)?(?:${CHANGE_VERBS}\b|${REPLY_EDIT})))`;
const KEPT_DRAFT = String.raw`\b(?:keep|leave)\b(?:\s+[\w'’]+){0,3}?\s+${DRAFT_PHRASE}\b${KEEP_CLAUSE_END}`;
const NEGATED_DRAFT_WORD = new RegExp(
  String.raw`\b(?:(?:not|don['’]?t|never)(?!${DRAFT_EDIT_AFTER_MAKE})|without|instead\s+of)\b(?:\s+[\w'’]+){0,3}?\s+${DRAFT_PHRASE}\b|${KEPT_DRAFT}`,
  'gi'
);

/** LAB-3367 Group A: the member asks to keep the draft as it is ("keep the draft and shorten your last answer"). */
const KEEPS_DRAFT = new RegExp(KEPT_DRAFT, 'i');

/**
 * LAB-3367 Group A: "don't make the draft now" or "... yet" (also "not", "do not" or "never"). Like a keep clause, it
 * protects the draft also after the draft line. "not the intro draft" and "don't make the draft longer" do not match.
 */
const NO_DRAFT_NOW = new RegExp(
  String.raw`\b(?:not|don['’]?t|never)\s+make\s+(?:(?:the|my|this|a|an)\s+)?${DRAFT_PHRASE}\s+(?:now|yet)\b`,
  'i'
);

/**
 * LAB-3367 o3, p4: the change words. Only a message with one of them gets the fixed answer when the latest reply is
 * not known, for example "shorten your last answer". "Your last answer did not load. What is new in LabOS?" has none.
 * "cut" does not count after "was" or "got", or before "off" or "short": "your last answer was cut off" tells what
 * happened.
 */
const CHANGE_WORD =
  /\b(?:shorten|shorter|rewrite|reword|rephrase|change|edit|revise|fix|add|remove|delete|expand|longer|simplify|summari[sz]e|condense|trim)\b|(?<!\b(?:was|got)\s+)\bcut\b(?!\s+(?:off|short)\b)|\btoo\s+long\b/i;

/** LAB-3367 F6: more change words: "simpler", "brief", "concise", "translate", "redo" and "in <n> sentences". */
const F6_CHANGE_WORD =
  /\b(?:simpler|brief|concise|translate|redo)\b|\bin\s+(?:\d+|one|two|three|four|five)\s+sentences?\b/i;

/**
 * LAB-3367 t4: the message tells that the answer failed. Then the F6 change words do not count: "your last answer was
 * cut off, tell me about Lit Protocol again in two sentences" asks for the answer again, not for a change.
 */
const ANSWER_FAILED = /\b(?:did\s*n[o']?t\s+load|didn’t\s+load|was\s+cut\s+off|got\s+cut\s+off|failed|stopped)\b/i;

/** LAB-3367 o3, F6, t4: true when the message asks to change the reply. */
function asksForChange(message: string): boolean {
  return CHANGE_WORD.test(message) || (F6_CHANGE_WORD.test(message) && !ANSWER_FAILED.test(message));
}

/**
 * LAB-3367 review item 4, t2: a request to change a text that the member pastes after a colon or a line break, at the
 * start of the message: "shorten this: <text>", "rewrite the following text:\n<text>". The group is the text.
 */
const PASTED_TEXT =
  /^\s*(?:please\s+)?(?:shorten|rewrite|reword|rephrase|simplify|summari[sz]e|condense|trim|edit|fix|translate|cut)\s+(?:this|the\s+following)(?:\s+(?:text|paragraph|message))?[^\S\n]*(?::|\n)([\s\S]*)$/i;

/** LAB-3367 t2: the start of an edit instruction, not a pasted text: "edit this: add my PS to it". */
const EDIT_START = /^\s*(?:add|remove|make|keep|mention|use|change|the\s+name\s+is)\b/i;

/**
 * LAB-3367 t2, u1: true for a pasted text. The text has 4 or more words and does not start with an edit verb or a
 * small letter, and the message has no draft word. "fix this: the name is wrong, it is Grace", "rewrite this: more friendly" and "shorten
 * this draft: ..." are draft edits.
 */
function isPastedText(message: string): boolean {
  const text = PASTED_TEXT.exec(message)?.[1];
  // u1: a text that starts with a small letter is an edit instruction: "edit this: please add my PS to the end".
  if (text === undefined || DRAFT_WORD.test(message) || EDIT_START.test(text) || /^\s*\p{Ll}/u.test(text)) return false;
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length >= 4;
}

/** LAB-3367 p3: true when one "what you said" in `message` names the previous reply, not content for the draft. */
function saysWhatYouSaid(message: string): boolean {
  for (const match of message.matchAll(WHAT_YOU_SAID)) {
    // Only the same sentence counts: the text after the last ".", "!", "?" or line break before the phrase (s3).
    const before =
      message
        .slice(0, match.index)
        .split(/[.!?\n]/)
        .pop() ?? '';
    // The text after the last content verb, or none. A "to" or a revision verb there points to the reply (s3).
    const after = LAST_CONTENT_VERB.exec(before)?.[1];
    if (after === undefined || REVISION_AFTER_CONTENT.test(after)) return true;
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
 *   line (`INTRO_DRAFT_LINE`), so a revision of the card is correct. A message that keeps the draft ("keep the draft
 *   and shorten your last answer") or "don't make the draft now / yet" does not get this path after the draft line
 *   (Group A).
 * - 'answer': the turn has no `draft_intro` tool, no card text and no intro hints. The message changes a pasted text
 *   (`isPastedText`, review item 4, t2), or the latest reply is a normal answer, or it is not known and the message has no
 *   change word.
 * - 'which': the latest reply is not known ('') or is `WHICH_REPLY_LINE`, and the message has a change word. The turn
 *   also gets the fixed answer `WHICH_REPLY_LINE`.
 */
export function lastAnswerTurn(message: string, hasCard: boolean, latestReply: string): 'model' | 'answer' | 'which' {
  if (!hasCard) return 'model';
  // Review item 4: the pasted text is the text to change, so the card cannot change, with any latest reply.
  if (isPastedText(message)) return 'answer';
  if (!namesOwnLastAnswer(message)) return 'model';
  const reply = latestReply.trim();
  // Group A: an explicit "keep the draft ..." or "don't make the draft now / yet" protects the draft also right after
  // the draft line. Other negations ("not the intro draft") keep the draft path there.
  if (reply === INTRO_DRAFT_LINE && !KEEPS_DRAFT.test(message) && !NO_DRAFT_NOW.test(message)) return 'model';
  if ((!reply || reply === WHICH_REPLY_LINE) && asksForChange(message)) return 'which';
  return 'answer';
}

/** LAB-3367 o1: `text` without each intro hint, so a turn with no `draft_intro` tool has no text that names it. */
export function withoutIntroHints(text: string | undefined, hints: readonly string[]): string | undefined {
  if (!text) return text;
  return hints.reduce((out, hint) => out.split(hint).join(''), text) || undefined;
}
