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

/**
 * LAB-3367 Q1, s4 (Oleg, decided): the fact rule for the member in the draft text, for new drafts and revisions. The
 * `draft_intro` description and the card prompt use this same text. Facts about the target from the page or a tool
 * stay allowed.
 */
export const DRAFT_FACTS_RULE =
  'In the draft text, facts about the member come only from the member’s message or their LabOS profile (a tool ' +
  'result). When the member asks you to mention something about themselves, use their words. Do not add ' +
  'experience, duration, results, roles or opinions from anywhere else.';

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
      `The text is from ${MIN} to ${MAX} characters, in the voice of the member: who they are, what they ask, and why. ` +
      // LAB-3367 Q1, s4 (Oleg): the exact fact rule for new drafts and revisions.
      `${DRAFT_FACTS_RULE} ` +
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
