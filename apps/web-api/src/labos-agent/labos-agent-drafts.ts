import { Logger } from '@nestjs/common';
import { CoreTool, tool } from 'ai';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { LABOS_AGENT_INTRO_DRAFT_LIMITS, LabosAgentDraft } from 'libs/contracts/src/schema/labos-agent';
import { IntroRequestsService } from '../intro-requests/intro-requests.service';
import { McpActorContext } from '../mcp/mcp-tools';

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
export const ADD_THAT_LINE =
  'I did not change the draft, so it keeps the text from your earlier messages. ' +
  'To add a new detail, write the detail in your message.';

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

/** LAB-3367 B4: the refusal for a stronger draft with a new claim. It names no member text. */
export const ADDED_CLAIM_TEXT =
  'The draft was refused: it adds a claim that the member did not give. ' +
  'Write it again. Only reorder or reword the facts of the current text. Do not add experience or expertise.';

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
  /** LAB-3367 B4: the waiting card and the message, for the claim check. B3: `onDraft` clears the kept target. */
  card?: { type: string; uid: string; text: string };
  message?: string;
  onDraft?: () => Promise<void>;
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
        // LAB-3367 B4: a revision of the card adds no experience claim.
        const card =
          deps.card && deps.card.type === target.type && deps.card.uid === target.uid ? deps.card : undefined;
        if (addedClaims(text, card?.text, deps.message).length) return ADDED_CLAIM_TEXT;
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
        await deps.onDraft?.();
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
