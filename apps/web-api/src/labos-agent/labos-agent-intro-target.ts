import { IntroTurnTarget } from './labos-agent-drafts';

/**
 * LAB-3367 B3: which intro target a C1 message means. Pure checks of the message text, so the service only reads and
 * writes the kept target. When the text is not clear, the answer is never "only the page": the kept target stays.
 */

/** The message asks for an intro ("Draft an intro to this team"). */
const INTRO_WORDS = /\b(?:intros?|introductions?|introduced?)\b/i;

/** "intro to", "intro request to", "introduce me to": the recipient is the text right after it. */
const INTRO_TO = /\b(?:intro(?:s|duction|ductions)?|introduced?)(?:\s+[\w'’]+){0,2}?\s+to\s+(?=\S)/gi;

/** "not an intro to Grace", "I don't want an intro to Grace": not a recipient. */
const NEGATED = /(?:\b(?:not|no)|n['’]t\s+\w+)\s+(?:an?\s+|the\s+)?$/i;

const TEAM_WORDS = 'team|company|org|organi[sz]ation|project';
const MEMBER_WORDS = 'member|person|profile';
const TYPE_RECIPIENT = new RegExp(String.raw`^(?:this|that|the)\s+(?:(${TEAM_WORDS})|(${MEMBER_WORDS}))\b`, 'i');
/** "this team" with no "intro to" before it ("an intro request for this team"), but not "I work at this team". */
const TYPE_IN_TEXT = /(?<!\b(?:at|from|in|of|by|on)\s+)\bthis\s+(?:(team)|(member|person))\b/i;

/** A recipient that is not the kept target, the page or an item of the message: a name, "another team". */
const OTHER_RECIPIENT = /^(?:@|\p{Lu}\p{Ll})/u;
const OTHER_WORDS = /^(?:an?other|someone\s+else|a\s+different)\b/i;

/** The member ends the intro request: "no intro", "forget it", "never mind", "cancel it". */
const CANCELS = /\b(?:no\s+intro|forget\s+(?:it|that|about)|never\s*mind|cancel\s+(?:it|that|this|the\s+intro))\b/i;

/** A directory search, at the start of the message: "find storage teams", "I want to find storage teams". */
const SEARCHES =
  /^\s*(?:(?:ok(?:ay)?|no|please|actually|instead|now)\b[,.!]?\s+)*(?:(?:can|could|would)\s+you\s+(?:please\s+)?)?(?:(?:i|we)(?:\s+(?:want|need|would\s+like)|['’]d\s+like)\s+(?:to\s+|an?\s+)?)?(?:find|search|look\s+up|list|show|see|browse)\b[^.!?\n]*\b(?:teams|members|people|jobs|roles|projects|companies|founders|investors|news)\b/i;

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `text` starts with the name, also with "the" or "@" before it, as whole words. */
const startsWithName = (text: string, name: string) =>
  !!name && new RegExp(String.raw`^(?:the\s+)?@?${escaped(name)}(?![\p{L}\p{N}])`, 'iu').test(text);

const hasWord = (text: string, word: string) =>
  new RegExp(String.raw`(?<![\p{L}\p{N}])${escaped(word)}(?![\p{L}\p{N}])`, 'iu').test(text);

/** The first name ("Grace" of "Grace Hopper"), or undefined when it is short, "The" or the whole name. */
function firstName(name: string): string | undefined {
  const [first, second] = name.split(/\s+/);
  return second && first.length > 2 && !/^the$/i.test(first) ? first : undefined;
}

/** "Grace" for Grace Hopper, but not "Grace Kim". */
function startsWithFirstName(text: string, name: string): boolean {
  const first = firstName(name);
  if (!first || !startsWithName(text, first)) return false;
  return !/^\s+\p{Lu}\p{Ll}/u.test(text.slice(text.toLowerCase().indexOf(first.toLowerCase()) + first.length));
}

/** The text right after the first "intro to" of the message, or undefined. */
function introRecipient(message: string): string | undefined {
  for (const match of message.matchAll(INTRO_TO)) {
    const start = match.index ?? 0;
    if (!NEGATED.test(message.slice(0, start))) return message.slice(start + match[0].length);
  }
  return undefined;
}

function typeOf(match: RegExpExecArray | null): IntroTurnTarget['type'] | undefined {
  return match ? (match[1] ? 'team' : 'member') : undefined;
}

/**
 * The one chip that the member chose as the recipient of an intro request, or undefined (X2). The @name comes right
 * after "intro to", or a type word names the chip type and not the page type. A chip that the message only mentions
 * ("@Kyle told me about it") is never the recipient.
 */
export function chosenChip(
  message: string,
  chips: readonly IntroTurnTarget[],
  page: IntroTurnTarget | undefined
): IntroTurnTarget | undefined {
  if (!INTRO_WORDS.test(message)) return undefined;
  const text = introRecipient(message);
  if (text !== undefined) {
    const named = [...chips, ...(page ? [page] : [])].filter((target) => startsWithName(text, target.name));
    if (named.length) {
      // The longest name wins: "Acme Team" over "Acme". Two targets with one name are not clear.
      const longest = Math.max(...named.map((target) => target.name.length));
      const best = named.filter((target) => target.name.length === longest);
      const rest = text
        .replace(/^the\s+/i, '')
        .replace(/^@/, '')
        .slice(longest);
      // "to @Acme Team and @Kyle Weiss" has two recipients, so both stay.
      return best.length > 1 || best[0] === page || /^\s*(?:and|or|&)\s+@/i.test(rest) ? undefined : best[0];
    }
  }
  const type = typeOf(text === undefined ? TYPE_IN_TEXT.exec(message) : TYPE_RECIPIENT.exec(text));
  if (!type || type === page?.type) return undefined;
  const ofType = chips.filter((chip) => chip.type === type);
  return ofType.length === 1 ? ofType[0] : undefined;
}

/** How a turn uses the kept target. `both`: the page is also named, so the page is a target too. */
export type KeptTargetUse = 'kept' | 'both' | 'page' | 'drop';

/**
 * LAB-3367 X1, R1: the kept target stays for each message that does not name another recipient, whatever its words.
 * - 'page': the recipient after "intro to" is the page ("an intro to Grace instead"). The kept target goes.
 * - 'drop': another recipient, a directory search or a cancel. The kept target goes, and the page does not replace it.
 * - 'both': the message names the page in another way ("Grace told me about them", "I want to ask Grace").
 */
export function keptTargetUse(
  message: string,
  kept: IntroTurnTarget,
  page: IntroTurnTarget | undefined
): KeptTargetUse {
  const text = introRecipient(message);
  if (text !== undefined) {
    if (startsWithName(text, kept.name)) return 'kept';
    if (page && startsWithName(text, page.name)) return 'page';
    if (startsWithFirstName(text, kept.name)) return 'kept';
    if (page && startsWithFirstName(text, page.name)) return 'page';
    if (page && /^(?:this|the)\s+page\b/i.test(text)) return 'page';
    const type = typeOf(TYPE_RECIPIENT.exec(text));
    if (type) return type === page?.type ? 'page' : type === kept.type ? 'kept' : 'drop';
    if (page?.type === 'member' && /^(?:him|her)\b(?!\s+(?:team|company|org|project|lab)\b)/i.test(text)) {
      return kept.type === 'team' ? 'page' : 'both';
    }
    if (OTHER_RECIPIENT.test(text) || OTHER_WORDS.test(text)) return 'drop';
  }
  if (CANCELS.test(message) || SEARCHES.test(message)) return 'drop';
  return page && namesPage(message, kept, page) ? 'both' : 'kept';
}

function namesPage(message: string, kept: IntroTurnTarget, page: IntroTurnTarget): boolean {
  if (hasWord(message, page.name) || /\bthis\s+page\b/i.test(message)) return true;
  const first = firstName(page.name);
  if (page.type === 'member' && first && hasWord(message, first)) return true;
  const type = typeOf(new RegExp(String.raw`\bthis\s+(?:(${TEAM_WORDS})|(${MEMBER_WORDS}))\b`, 'i').exec(message));
  if (type === page.type) return true;
  return page.type === 'member' && kept.type === 'team' && /\b(?:he|she|him|her)\b/i.test(message);
}
