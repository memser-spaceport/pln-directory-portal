import { IntroTurnTarget } from './labos-agent-drafts';

/**
 * LAB-3367 B3: which intro target a C1 message means. Pure checks of the message text, so the service only reads and
 * writes the kept targets. A chip is chosen only by one strict rule (`chosenChip`); everything else is not clear and
 * keeps the chip AND the page. Do not add words to the strict rule: a miss is safe there, a wrong choice is not.
 */

const INTRO = String.raw`intro(?:duction)?s?(?:\s+(?:request|message|note|draft|email|text))?`;
const TEAM_WORDS = 'team|company|org|organi[sz]ation|project';
const MEMBER_WORDS = 'member|person|profile';

/** The start of a sentence or a clause, also after "ok", "please", "actually, " and the like. */
const START = String.raw`(?:^|[.!?;,:\n]\s*)(?:(?:hi|hello|hey|ok(?:ay)?|yes|yeah|no|please|sure|actually|now|instead|so|and|then|but|sorry|thanks|rather)\b[,.!:]?\s+)*`;
const NEW = '(?:(?:an?|another|one|new|short|quick|brief|warm|good|first|separate)\\s+)*';
const VERBS = String.raw`(?:re)?draft|write|prepare|compose|create|generate|request|make|do|send|start|get|give|want|need|like|love|prefer|ask\s+for|asking\s+for|looking\s+for|help\s+(?:me\s+|us\s+)?with|(?:can|could|may)\s+(?:i|we)\s+(?:please\s+)?have|rather\s+have`;

/** A request with its recipient: the text after the match. No past form is here. It never chooses a chip. */
const REQUESTS = [
  // "Draft an intro to ...", "I want an intro request for ...", "an intro with ..." at the start of a clause.
  String.raw`(?:${START}${NEW}|\b(?:${VERBS})\s+(?:(?:me|us|it)\s+)?(?:(?:the|my|our)\s+)?${NEW})${INTRO}\s+(?:to|for|with)\s+(?=\S)`,
  // "Introduce me to ...", "Can you introduce us to ...". Not "Kyle offered to introduce me to ...".
  String.raw`(?:${START}|\b(?:can|could|would|will)\s+(?:you|we)\s+(?:please\s+|also\s+)?|\bplease\s+|\b(?:want|like|need)\s+(?:you\s+)?to\s+)introduce\s+(?:(?:me|us)\s+(?:to|with)\s+)?(?=\S)`,
  // "I already have an intro to @Kyle, now draft one to this team".
  String.raw`\b(?:draft|write|prepare|compose|create|make|send)\s+(?:me\s+|us\s+)?one\s+(?:to|for|with)\s+(?=\S)`,
].map((source) => new RegExp(source, 'gi'));

/** Before a request, in the same clause: it is not a request of now ("Did you send an intro to", "he can give me ..."). */
const NOT_NOW =
  /\b(?:did|didn['’]t|after|since|when|already|thanks?|thank\s+you|said|told|offered|promised|he|she|they|who|can['’]t)\b/i;
/** "not an intro to Grace", "I don't want an intro to Grace": not a recipient. */
const NEGATED = /(?:\b(?:not|no|never)|n['’]t)\s+(?:\w+\s+)?(?:an?\s+|the\s+)?$/i;
/** The strict request, at the start of the message: "[Can you] draft an intro to", "Introduce me to". */
const STRICT_REQUEST = new RegExp(
  String.raw`^\s*(?:(?:hi|hello|hey|ok(?:ay)?|yes|please)\b[,.!]?\s+)*` +
    String.raw`(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|help\s+me\s+(?:to\s+)?|(?:i|we)(?:\s+(?:want|need|would\s+like)|['’]d\s+like)\s+(?:you\s+)?to\s+)?` +
    String.raw`(?:(?:draft|write|make|prepare|create|request)\s+(?:me\s+|us\s+)?(?:the\s+)?${NEW}${INTRO}|introduce\s+(?:me|us))\s+to\s+`,
  'i'
);
/** "I'd like an intro to this team". Only with a type word: "I want an intro to @Kyle" can be the reason of a page ask. */
const STRICT_WISH = new RegExp(
  String.raw`^\s*(?:i|we)(?:\s+(?:want|need|would\s+like)|['’]d\s+like)\s+${NEW}${INTRO}\s+to\s+(?=this\s)`,
  'i'
);
/** The recipient ends its clause. Not "this person in charge", "@Kyle or Gitcoin", "@Acme, @Kyle and ...". */
const CLAUSE_END = String.raw`(?=\s*(?:$|[.;:!?](?=\s|$)|,(?!\s*(?:and\b|or\b|@))|\n)|\s+(?:because|about|please)\b|\s+[-–—]\s)`;
/** A negation anywhere: "I don't want", "No need to", "No wait". */
const NEGATION = /\b(?:no|not|never|without|cannot)\b|\b(?:can|don|doesn|didn|won|isn|aren|wouldn|shouldn)['’]?t\b/i;

/** Any "intro to", also a past one ("Thanks for the intro to", "I was introduced to"). */
const INTRO_TO = /\b(?:intro(?:s|duction|ductions)?|introduced?)(?:\s+[\w'’]+){0,2}?\s+to\s+(?=\S)/gi;

const DETERMINER = String.raw`(?:an?|the|my|your|his|her|their|our|that|this)`;
/** The intro words of the past or of no request. The service must not read them as an ask. */
const PAST = new RegExp(
  [
    String.raw`\bthank(?:s|\s+you)\s+(?:\w+\s+){0,3}?for\s+(?:${DETERMINER}\s+)?(?:\w+\s+)?intro\w*`,
    String.raw`(?<!\b(?:be|get|getting)\s)\bintroduced\b`,
    String.raw`(?<!\b(?:can|could|may|might)\s+(?:i|we)\s+(?:please\s+)?)\b(?:got|gave|given|had|have|has|received|made|sent|wrote|after|since)\s+(?:(?:me|us|you)\s+)?(?:already\s+)?(?:${DETERMINER}\s+)?(?:\w+\s+)?intro\w*`,
    String.raw`\bdid\s+you\s+\w+\s+(?:${DETERMINER}\s+)?intro\w*`,
    String.raw`(?:\b(?:not|no|never)|n['’]t\s+\w+)\s+(?:${DETERMINER}\s+)?intro\w*`,
  ].join('|'),
  'gi'
);
/** An ask for an intro, also with no recipient ("Draft an intro", "connect me with this team"). */
const ASKS = /\b(?:intros?|introductions?|introduced?)\b|\bconnect\s+(?:me|us)\s+(?:with|to)\b/i;

const TYPE_RECIPIENT = new RegExp(String.raw`^(this|that|the)\s+(?:(${TEAM_WORDS})|(${MEMBER_WORDS}))\b`, 'i');
/** The recipient is the page member: "her", "him", but not "her team". */
const HIM_HER = /^(?:him|her)\b(?!\s+(?:team|company|org|project|lab)\b)/i;

/** A recipient that is not a kept target, the page or an item of the message: a name, "another team". */
const OTHER_RECIPIENT = /^(?:@|\p{Lu}\p{Ll})/u;
const OTHER_WORDS = /^(?:an?other|someone\s+else|a\s+different)\b/i;

/** The member ends the intro request: "no intro", "forget it", "never mind". Not "I have no intro deck". */
const CANCELS =
  /\bno\s+intro(?=\s*(?:$|[.,!?;]|\b(?:please|request|needed|now|any\s*more)\b))|(?<!n['’]t\s)\bforget\s+(?:it|that|about)\b|\bnever\s*mind\b(?!\s+(?:the|my|our|how)\b)|\bcancel\s+(?:it|that|this|the\s+intro)\b/i;

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

/** A recipient in the message: the text after "intro to / for / with". */
type Recipient = { text: string };

/** The requests of the message with a recipient, in order: "Draft an intro to ...". No past form, no negation. */
function requests(message: string): Recipient[] {
  return REQUESTS.flatMap((pattern) => [...message.matchAll(pattern)])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((match) => {
      const start = match.index ?? 0;
      const clause =
        message
          .slice(0, start)
          .split(/[.!?;,:\n]/)
          .at(-1) ?? '';
      return !NOT_NOW.test(clause) && !NEGATED.test(message.slice(0, start));
    })
    .map((match) => ({ text: message.slice((match.index ?? 0) + match[0].length) }));
}

/** Each "intro to" of the message that is not negated, also a past one. */
function introTos(message: string): string[] {
  return [...message.matchAll(INTRO_TO)]
    .filter((match) => !NEGATED.test(message.slice(0, match.index)))
    .map((match) => message.slice((match.index ?? 0) + match[0].length));
}

type TypeWord = { word: string; type: IntroTurnTarget['type'] };

function typeRecipient(text: string): TypeWord | undefined {
  const match = TYPE_RECIPIENT.exec(text);
  return match ? { word: match[1].toLowerCase(), type: match[2] ? 'team' : 'member' } : undefined;
}

/** The message names the page in any way: its name or first name, "this page", "this member" on a member page, "she". */
function mentionsPage(message: string, page: IntroTurnTarget, chip: IntroTurnTarget): boolean {
  // "@Grace Kim" is not the page Grace Hopper, and "@Acme Team" is not the page Acme.
  const rest = message.replace(new RegExp(`@?${escaped(chip.name)}`, 'gi'), ' ');
  if (hasWord(chip.name.length > page.name.length ? rest : message, page.name)) return true;
  const first = firstName(page.name);
  if (first && hasWord(rest, first)) return true;
  const words = page.type === 'team' ? TEAM_WORDS : MEMBER_WORDS;
  if (new RegExp(String.raw`\bthis\s+(?:page|${words})\b`, 'i').test(rest)) return true;
  return page.type === 'member' && /\b(?:he|she|him|her|his|hers)\b/i.test(rest);
}

/**
 * The one chip that the member chose (X2). The message STARTS with the request, the recipient ("this team", or the
 * @name right after "intro to" / "introduce me to") ENDS its clause, and the message has no negation, no second
 * "intro to" and does not name the page.
 */
function chosenChip(
  message: string,
  chips: readonly IntroTurnTarget[],
  page: IntroTurnTarget | undefined
): IntroTurnTarget | undefined {
  const request = STRICT_REQUEST.exec(message) ?? STRICT_WISH.exec(message);
  if (!request || NEGATION.test(message) || [...message.matchAll(INTRO_TO)].length > 1) return undefined;
  const text = message.slice(request[0].length);
  const word = new RegExp(String.raw`^this\s+(?:(${TEAM_WORDS})|(${MEMBER_WORDS}))\b`, 'i').exec(text);
  const ends = (recipient: string) => new RegExp(`^${recipient}${CLAUSE_END}`, 'i').test(text);
  // "this team @Acme Team": the app writes the chip into the text.
  const type = word && (word[1] ? 'team' : 'member');
  const named = chips.filter((chip) =>
    type
      ? chip.type === type && ends(String.raw`this\s+[a-z]+(?:,?\s+@${escaped(chip.name)})?`)
      : ends(String.raw`(?:the\s+)?@?${escaped(chip.name)}`)
  );
  if (named.length !== 1) return undefined;
  return page && mentionsPage(message, page, named[0]) ? undefined : named[0];
}

/** The recipient is the page: its name, "this page", "this member" on a member page, "her". */
function isPage(text: string, page: IntroTurnTarget, others: readonly IntroTurnTarget[]): boolean {
  // "Grace's team" and "this member's team" are not the page.
  const owner = [page.name, firstName(page.name) ?? page.name].map(escaped).join('|');
  if (new RegExp(String.raw`^(?:the\s+)?(?:@?(?:${owner})|(?:this|that|the)\s+\w+)['’]s\b`, 'i').test(text))
    return false;
  if (startsWithName(text, page.name) || startsWithFirstName(text, page.name)) return true;
  if (/^(?:this|the)\s+page\b/i.test(text)) return true;
  const named = typeRecipient(text);
  const sameType = others.some((target) => target.type === page.type);
  if (named) return named.type === page.type && (named.word === 'this' || !sameType);
  return page.type === 'member' && !sameType && HIM_HER.test(text);
}

/** "I lead this team", "I work at @Acme", "this team is mine": the own team of the member, not a recipient. */
function isOwnTeam(message: string, chip: IntroTurnTarget): boolean {
  const team = String.raw`(?:this\s+(?:${TEAM_WORDS})\b|@?${escaped(chip.name)}(?![\p{L}\p{N}]|['’]s))`;
  return (
    chip.type === 'team' &&
    new RegExp(
      String.raw`\b(?:i|we)(?:\s+(?:also|now|currently))?\s+(?:work(?:ed)?\s+(?:at|for)|lead|led|run|built|founded|co-?founded|started|own|joined)\s+${team}` +
        String.raw`|\bthis\s+(?:${TEAM_WORDS})\s+is\s+(?:mine|ours)\b|\bmy\s+(?:own\s+)?(?:${TEAM_WORDS})\b[,:]?\s+@`,
      'i'
    ).test(message)
  );
}

/**
 * What a message asks for with its chips.
 * - a target: the one chip that the member chose (`chosenChip`).
 * - 'unclear': any other ask for an intro with a chip that can be the recipient. The chip and the page stay targets.
 * - undefined: no ask, the page is the recipient, or the chip is the own team of the member ("I work at @Acme").
 */
export function introAsk(
  message: string,
  chips: readonly IntroTurnTarget[],
  page: IntroTurnTarget | undefined
): IntroTurnTarget | 'unclear' | undefined {
  if (!chips.length) return undefined;
  const chip = chosenChip(message, chips, page);
  if (chip) return chip;
  const asked = requests(message);
  if (
    page &&
    asked.some(({ text }) => isPage(text, page, chips)) &&
    !asked.some(({ text }) => namesChip(text, chips, page))
  ) {
    return undefined;
  }
  const asks = asked.length > 0 || (ASKS.test(message.replace(PAST, ' ')) && !CANCELS.test(message));
  return asks && (!page || chips.length > 1 || !isOwnTeam(message, chips[0])) ? 'unclear' : undefined;
}

/** True when the message has a request with a recipient. A message about the waiting card mostly has none. */
export const hasIntroRequest = (message: string) => requests(message).length > 0;

/** The recipient can be a chip: its name, or a type word of its type and not of the page type. */
function namesChip(text: string, chips: readonly IntroTurnTarget[], page: IntroTurnTarget): boolean {
  const type = typeRecipient(text)?.type;
  return chips.some((chip) => startsWithName(text, chip.name) || (chip.type === type && type !== page.type));
}

/** How a turn uses the kept targets. `both`: the page is also named, so the page is a target too. */
export type KeptTargetUse = 'kept' | 'both' | 'page' | 'pause';

/**
 * LAB-3367 X1, R1: the kept targets stay for each message that does not name another recipient, whatever its words.
 * - 'page': the recipient of a request is the page ("an intro to Grace instead"). The kept targets go.
 * - 'pause': another recipient, a directory search or a cancel. No target in this turn, then the page and the kept
 *   targets (D1).
 * - 'both': the message names the page in another way ("Grace told me about them", "the member instead").
 */
export function keptTargetUse(
  message: string,
  kept: readonly IntroTurnTarget[],
  page: IntroTurnTarget | undefined
): KeptTargetUse {
  const request = requests(message).at(-1)?.text;
  if (request !== undefined && page && !namesKept(request, kept) && isPage(request, page, kept)) return 'page';
  const recipients = [request, ...introTos(message.replace(PAST, ' '))].filter((text): text is string => !!text);
  for (const text of recipients) {
    if (namesKept(text, kept)) return page && namesPage(message, kept, page) ? 'both' : 'kept';
    // Also "Grace's team": the page member is named, so both stay.
    if (page && (isPage(text, page, []) || namesKept(text, [page]))) continue;
    const named = typeRecipient(text);
    if (
      named ? !kept.some((target) => target.type === named.type) : OTHER_RECIPIENT.test(text) || OTHER_WORDS.test(text)
    ) {
      return 'pause';
    }
  }
  if (CANCELS.test(message) || SEARCHES.test(message)) return 'pause';
  return page && namesPage(message, kept, page) ? 'both' : 'kept';
}

/** The text starts with the name or the first name of one of the targets. */
const namesKept = (text: string, kept: readonly IntroTurnTarget[]) =>
  kept.some((target) => startsWithName(text, target.name) || startsWithFirstName(text, target.name));

function namesPage(message: string, kept: readonly IntroTurnTarget[], page: IntroTurnTarget): boolean {
  if (hasWord(message, page.name) || /\b(?:this|the)\s+page\b/i.test(message)) return true;
  const first = firstName(page.name);
  if (page.type === 'member' && first && hasWord(message, first)) return true;
  // "the member instead", "Not the team, the person": each type word of the message.
  const words = page.type === 'team' ? TEAM_WORDS : MEMBER_WORDS;
  if (new RegExp(String.raw`\b(?:this|that|the)\s+(?:page\s+|other\s+)?(?:${words})\b`, 'i').test(message)) return true;
  return page.type === 'member' && kept.every((t) => t.type === 'team') && /\b(?:he|she|him|her)\b/i.test(message);
}
