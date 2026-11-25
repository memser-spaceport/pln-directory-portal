import { Logger } from '@nestjs/common';
import { CoreTool, tool } from 'ai';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { LABOS_AGENT_INTRO_DRAFT_LIMITS, LabosAgentDraft } from 'libs/contracts/src/schema/labos-agent';
import { IntroRequestsService } from '../intro-requests/intro-requests.service';
import { McpActorContext } from '../mcp/mcp-tools';
import { stripHtmlToPlainText } from '../team-news/team-news-body-html.util';

/** The intro target of this turn, with the name from the database (C3 lookup). */
export type IntroTurnTarget = LabosAgentDraft['target'];

export const INTRO_NOT_ELIGIBLE_TEXT =
  'The member cannot request intros. Only members of portfolio teams and PL Infra can. ' +
  'Make no draft. Tell the member this.';

/**
 * LAB-3362 D4: the whole answer text of a turn with an intro draft. The draft text is only in the draft card. The
 * stream shows this line in place of the model text while the turn has a draft (`answerLine` of the Husky stream).
 */
export const INTRO_DRAFT_LINE = 'Here is a draft intro. Edit it in the card, then send.';

/** LAB-3367 t7b: other forms of `INTRO_DRAFT_LINE` that the stream also removes from the model text of a turn with no draft. */
export const INTRO_DRAFT_LINE_FORMS = [
  'Here’s a draft intro. Edit it in the card, then send.',
  "Here's a draft intro. Edit it in the card, then send.",
];

/** LAB-3367 t1: the answer of a turn with no draft and no text, for example after the stream removed the draft line. */
export const NO_CHANGE_LINE = 'I did not change anything. Please say it again in other words.';

/**
 * LAB-3367 Q1, s4, t3 (Oleg, decided): the fact rule for the member in the draft text, for new drafts and revisions.
 * The `draft_intro` description and the card prompt use this same text. Facts about the target can come from the page
 * or a tool.
 */
export const DRAFT_FACTS_RULE =
  'In the draft text, facts about the member come only from the member’s messages or their LabOS profile (a tool ' +
  'result). When the member asks you to mention something about themselves, use their words. Do not add or ' +
  'strengthen experience, duration, results, roles, opinions, shared work or a vouch about the member from anywhere ' +
  'else. Facts about the target can come from the page or a tool.';

/**
 * LAB-3367 G8 (Oleg): the limits of the draft text, for new drafts and revisions. The `draft_intro` description and the
 * card prompt use this same text, after `DRAFT_FACTS_RULE`.
 */
export const DRAFT_LIMITS_RULE =
  'When a fact is not given, leave it out. A short draft is correct. ' +
  'Use only the words of the member and the facts of their LabOS profile. ' +
  'Do not add experience, work, skills, an intent or a reason that the member did not give. ' +
  'To know a member, a team or a project is not experience with it. ' +
  'Keep each concrete detail in the words of the member. ' +
  'Do not make it more general. ' +
  // LAB-3367 G8: ask on every page, the same text as the page hints (INTRO_REASON_RULE).
  'For a new draft: if the member gave no reason for the intro, make no draft and ask the member for the reason. ' +
  'For a request such as "make it more convincing", only reorder or reword the facts of the current text. ' +
  'Add no new fact.';

/**
 * LAB-3367 G8: the reason rule of each intro hint (the intro page, a member or team page, and a mention). The hints
 * and `DRAFT_LIMITS_RULE` ask for the reason in the same case.
 */
export const INTRO_REASON_RULE =
  'If the member gave no reason for the intro, make no draft and ask the member for the reason.';

/** LAB-3367 G3: the bare words for the draft line in the `Previous reply` line of the answer prompt. */
export const INTRO_DRAFT_REPLY_LABEL = 'an intro draft card';

/** LAB-3367 t3: the read tools for the member's own LabOS profile. */
export const PROFILE_READ_TOOLS = ['get_my_profile', 'list_my_experiences'] as const;

/**
 * LAB-3367 t3, G8: the sentences that name the profile read tools of this turn, or '' when the turn has none. With
 * `get_my_profile`, the model calls it before the first draft.
 */
export function profileToolsLine(names: readonly string[]): string {
  const tools = PROFILE_READ_TOOLS.filter((name) => names.includes(name));
  if (!tools.length) return '';
  const first = tools.includes('get_my_profile') ? 'Call get_my_profile before the first draft. ' : '';
  return `To read the member’s own LabOS profile, you can call ${tools.join(' or ')}. ${first}`;
}

/** LAB-3367 B2 (Oleg): the fixed answer to a bare "add that" right after a draft turn. The card does not change. */
export const ADD_THAT_LINE = 'I did not change the draft.';

/** LAB-3367 B2: the whole message is only "add that", "add it to the draft", "put this in the intro" and the like. */
export const isBareAddThat = (message: string) =>
  /^\s*(?:please\s+)?(?:add|put|include|use)\s+(?:that|this|it)(?:\s+(?:to|in|into)\s+(?:the|my|this)\s+(?:intro\s+)?(?:draft|intro|card))?(?:\s*,?\s*please)?\s*[.!]?\s*$/i.test(
    message
  );

/** LAB-3367 B4 (Oleg): the experience claims that a revision must not add. Mild phrases are post-v0. */
const CLAIM_WORDS =
  /\b(?:experience[ds]?|expert(?:ise|s)?|hands-on|track\s+record|seasoned|veteran|proven|well-versed|background\s+in)\b/gi;

/** LAB-3367 B4: the claim words of `text` that are not in the card text or the message. No card gives []. */
export function addedClaims(text: string, cardText: string | undefined, message: string | undefined): string[] {
  if (cardText === undefined) return [];
  const known = `${cardText}\n${message ?? ''}`.toLowerCase().replace(/\s+/g, ' ');
  const found = (text.match(CLAIM_WORDS) ?? []).map((word) => word.toLowerCase().replace(/\s+/g, ' '));
  return [...new Set(found)].filter((word) => !known.includes(word));
}

/** LAB-3367 B4: one spelling for the claim words, so "hands on" and "experienced" match "hands-on" and "experience". */
const sameWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2010\u2011]/g, '-')
    .replace(/\b(hands|well)\s+(on|versed)\b/g, '$1-$2')
    .replace(/\btrack\s+record\b/g, 'track-record')
    .replace(/\bexperience[ds]\b/g, 'experience');

/** The words that carry no fact. Not "your": "experience with your team" is a claim about the target. */
const FILLER = new Set(
  (
    'i me my we us our am is are was were be been have has had having a an the some also as of in on at for from with ' +
    "to by and or that this it too so bring brings can could would will i'm i've i'd we're we've"
  ).split(' ')
);

const words = (text: string) =>
  (
    sameWords(text)
      .replace(/’/g, "'")
      .match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []
  ).map((word) => word.replace(/(?<=\p{L}{3})s$/u, ''));

/** The parts of a text with one claim each: "I lead fundraising and I have experience with IPFS" has two. */
const CLAIM_PART_END =
  /[.;:!?\n()]+|(?:,\s*)?\b(?:which|because|but|so)\b|(?:,|\band\b)\s*(?=(?:i|we|my|our|have|has|am|are|would|want)\b)/i;

/**
 * LAB-3367 B4: true when each part of `text` with a claim word of `claims` is an own fact of the member: all its words
 * are in ONE fact. So "experience with IPFS" does not allow "experience in the grants space".
 */
export function claimsAreOwn(text: string, claims: readonly string[], facts: readonly string[]): boolean {
  const factWords = facts.map((fact) => new Set(words(fact)));
  const parts = text
    .split(CLAIM_PART_END)
    .filter((part) => claims.some((claim) => part.toLowerCase().replace(/\s+/g, ' ').includes(claim)));
  return (
    parts.length > 0 &&
    parts.every((part) => {
      const needed = words(part).filter((word) => !FILLER.has(word));
      return factWords.some((known) => needed.every((word) => known.has(word)));
    })
  );
}

/** The member says it about themselves: "I have ...", "I'm an ...", "my ... experience", "10 years of experience in". */
const CLAIM = CLAIM_WORDS.source;
const OWN_CLAIM = new RegExp(
  String.raw`\b(?:i|we)(?:['’](?:m|ve|re)|\s+(?:also\s+)?(?:am|are|was|were|have|had|got|gained|bring|built|worked\s+as))\b` +
    String.raw`|\b(?:my|our)\s+(?:[\w-]+\s+){0,2}?${CLAIM}` +
    String.raw`|^\s*(?:[\w+]+\s+){0,3}?years\s+of\s+(?:hands[\s-]on\s+)?experience\b|^\s*(?:hands[\s-]on\s+)?(?:experience|expertise)\s+(?:with|in)\b`,
  'i'
);
/** Not a fact about the member: a negation, or a claim about another person. */
const NOT_OWN = new RegExp(
  String.raw`\b(?:not|no|never|without|remove|drop|delete|pretend|sound|as\s+if|they|he|she)\b|n['’]t\b` +
    String.raw`|\b(?:your|their|his|her)\s+(?:[\w-]+\s+){0,2}?${CLAIM}`,
  'i'
);

/** LAB-3367 B4: the sentences of a member message that state an own experience claim. No question, no negation. */
export function ownClaims(message: string): string[] {
  return message
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim().slice(0, 300))
    .filter((sentence) => new RegExp(CLAIM, 'i').test(sentence) && !sentence.endsWith('?'))
    .filter((sentence) => OWN_CLAIM.test(sentence) && !NOT_OWN.test(sentence));
}

/** LAB-3367 B4: the facts of a profile tool result: each sentence of a text, and each entry of a list as one fact. */
export function profileFacts(value: unknown): string[] {
  if (typeof value === 'string') return stripHtmlToPlainText(value).split(/(?<=[.!?])\s+|\n+/);
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'string'
        ? item
        : Object.values(item ?? {})
            .filter((field) => typeof field === 'string')
            .join(' ')
    );
  }
  return value && typeof value === 'object' ? Object.values(value).flatMap(profileFacts) : [];
}

/** LAB-3367 B4: the refusal for a draft with a new claim. It names no member text. */
export const ADDED_CLAIM_TEXT =
  'The draft was refused: it adds a claim that the member did not give. ' +
  'Write it again. Use only the facts of the current text, of the member’s messages and of their LabOS profile, in ' +
  'the same words. Do not add other experience or expertise.';

/** The answer line while the turn has a draft, else undefined. For `ContextualToolsOptions.answerLine`. */
export function introDraftLine(drafts: LabosAgentDraft[]): string | undefined {
  return drafts.length ? INTRO_DRAFT_LINE : undefined;
}

/** A fixed text for an unexpected error. The error itself goes to the server log, never to the model. */
export const INTRO_DRAFT_FAILED_TEXT =
  'The draft failed because of a server error. Make no draft. Tell the member to try again later.';

const { minLength: MIN, maxLength: MAX } = LABOS_AGENT_INTRO_DRAFT_LIMITS;
const logger = new Logger('LabosAgentDrafts');

export type DraftDeps = {
  introRequests: IntroRequestsService;
  /**
   * The intro targets of this turn: the `intro` page target, the `member` or `team` page target (S5), and each `member`
   * or `team` mention (S6, LAB-3318). Empty when the turn has none.
   */
  targets: IntroTurnTarget[];
  /** The stream body `drafts`. The stream reads it when it ends. */
  drafts: LabosAgentDraft[];
  /** LAB-3367 t3: the names of the read tools of this turn, so the description names only the profile tools there. */
  readTools?: readonly string[];
  /**
   * LAB-3367 B4: the waiting card and the message, for the claim check. `ownFacts` gives the own facts of the member
   * (earlier messages, LabOS profile). It runs only when the draft has a claim that the card and the message do not.
   */
  card?: { type: string; uid: string; text: string };
  message?: string;
  ownFacts?: () => Promise<string[]>;
};

/**
 * `draft_intro` (LAB-3300, contract section 8.3). An agent tool only, not an MCP tool. Propose only: it reads the
 * sender rule and the target, and writes nothing (no IntroRequest row, no Telegram post, no cache entry). The member
 * edits the draft and sends it with C3. A refusal is a text for the model, and the turn has no draft: each call
 * first clears `drafts`, so a refused second call also removes the draft of the first call (S3-R8).
 */
export function draftIntroTool(ctx: McpActorContext, deps: DraftDeps): CoreTool {
  return tool({
    description:
      'Write a draft intro request from the member to a member or team in the page context or the items of the message. ' +
      `The text is from ${MIN} to ${MAX} characters, in the voice of the member: who they are, what they ask, and why (only a reason that the member gave). ` +
      // LAB-3367 Q1, s4, t3 (Oleg): the exact fact rule for new drafts and revisions, and the profile tools of the turn.
      `${DRAFT_FACTS_RULE} ` +
      // LAB-3367 G8: leave out facts that are not given, and add no reason or experience.
      `${DRAFT_LIMITS_RULE} ` +
      profileToolsLine(deps.readTools ?? []) +
      'The tool only makes a draft card. The member edits it and presses Send. Nothing is sent. ' +
      'Call it before you write the answer. Do not write the draft text in the answer: the card shows it. ' +
      'Use it only for an intro target of this turn. Make one draft for one target. When there is no target, ask the member to open ' +
      '"Ask the agent" from the member or team profile.',
    parameters: z.object({
      type: z.enum(['member', 'team']),
      targetUid: z.string(),
      text: z.string(),
    }),
    execute: async (args: { type: 'member' | 'team'; targetUid: string; text: string }) => {
      // A refusal gives `drafts: []`, also after an earlier draft in this turn. Only a valid call adds a draft.
      deps.drafts.splice(0, deps.drafts.length);
      // 1. Only a target of this turn. A turn still has at most 1 draft (S3-R8).
      const target = deps.targets.find((item) => item.type === args.type && item.uid === args.targetUid);
      if (!target) {
        return (
          'The draft was refused: the target is not the intro target of this turn. Make no draft. ' +
          'Ask the member to @mention the member or team in the message, ' +
          'or to open "Ask the agent" from the profile of the member or team.'
        );
      }
      try {
        // 2. The C3 sender rule, the same code as C3.
        if (!(await deps.introRequests.findEligibleRequester(ctx.email))) return INTRO_NOT_ELIGIBLE_TEXT;
        // 3. The target name from the agent lookup (C3 rule, and a deleted team is unknown), not from the model.
        const name = await deps.introRequests.findAgentTargetName(
          target.type === 'member' ? 'MEMBER' : 'TEAM',
          target.uid
        );
        if (!name) return `The draft was refused: the ${target.type} was not found. Make no draft.`;
        // 4. The limits of the intro modal.
        const text = (args.text ?? '').trim();
        if (text.length < MIN || text.length > MAX) {
          return (
            `The draft was refused: the text has ${text.length} characters. ` +
            `Write it again with ${MIN} to ${MAX} characters.`
          );
        }
        // LAB-3367 B4: a revision of the card adds no experience claim that is not an own fact of the member.
        const card =
          deps.card && deps.card.type === target.type && deps.card.uid === target.uid ? deps.card : undefined;
        const claims = addedClaims(text, card?.text, deps.message);
        if (claims.length && !claimsAreOwn(text, claims, (await deps.ownFacts?.()) ?? [])) return ADDED_CLAIM_TEXT;
        // 5. One draft per turn: a valid second call replaces the first.
        const draft: LabosAgentDraft = {
          draftId: `dr_${randomUUID()}`,
          kind: 'intro',
          target: { type: target.type, uid: target.uid, name },
          text,
          minLength: MIN,
          maxLength: MAX,
          source: 'agent',
        };
        deps.drafts.push(draft);
        return (
          `Draft ${draft.draftId} is ready for ${name}. Nothing is sent. ` +
          'The card shows the draft. Do not repeat the draft text. ' +
          `Write only this line as the answer: "${INTRO_DRAFT_LINE}"`
        );
      } catch (error) {
        logger.error(`draft_intro failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
        return INTRO_DRAFT_FAILED_TEXT;
      }
    },
  });
}
