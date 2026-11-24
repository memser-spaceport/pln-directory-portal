import { INTRO_DRAFT_LINE } from './labos-agent-drafts';

/**
 * LAB-3367 F1, F3, K3: the fixed answer when the member asks to change "your last answer", an intro draft card
 * waits, and the latest reply is not known or is this same question. The draft stays unchanged.
 */
export const WHICH_REPLY_LINE =
  'I do not know which reply you want me to change. Tell me which reply to change. Your intro draft did not change.';

/**
 * LAB-3367 F1, F3, K3: the literal phrases that name the agent's own previous reply. They match only as whole words,
 * in any letter case. This is a narrow check for the agreed examples, not a language guess: other words for the same
 * request go to the model, with the prompt rules.
 */
const OWN_REPLY_PHRASE = /\byour\s+(?:last|latest|previous)\s+(?:answer|reply|response)\b/i;

/** A message with one of these words can point to the draft, for example "add your last answer to the draft". */
const DRAFT_WORD = /\b(?:draft|intro)\b/i;

/** True when `message` names the agent's own previous reply and does not name a draft or an intro. */
export function namesOwnLastAnswer(message: string): boolean {
  return OWN_REPLY_PHRASE.test(message) && !DRAFT_WORD.test(message);
}

/**
 * LAB-3367 F1, F3, K3: how a C1 turn handles an explicit request to change "your last answer".
 * - 'model': no change. No card waits, the message does not name the last answer, or the latest reply is the draft
 *   line (`INTRO_DRAFT_LINE`), so a revision of the card is correct.
 * - 'answer': the latest reply is a normal answer. The turn has no `draft_intro` tool and no card text.
 * - 'which': the latest reply is not known ('') or is `WHICH_REPLY_LINE`. The turn has no `draft_intro` tool and no
 *   card text, and the answer is `WHICH_REPLY_LINE`.
 */
export function lastAnswerTurn(message: string, hasCard: boolean, latestReply: string): 'model' | 'answer' | 'which' {
  if (!hasCard || !namesOwnLastAnswer(message)) return 'model';
  const reply = latestReply.trim();
  if (reply === INTRO_DRAFT_LINE) return 'model';
  if (!reply || reply === WHICH_REPLY_LINE) return 'which';
  return 'answer';
}
