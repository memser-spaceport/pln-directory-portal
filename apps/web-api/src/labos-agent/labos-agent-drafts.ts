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

const { minLength: MIN, maxLength: MAX } = LABOS_AGENT_INTRO_DRAFT_LIMITS;

export type DraftDeps = {
  introRequests: IntroRequestsService;
  /** `context.introTarget` of this turn, or undefined when the page is not `intro`. */
  target: IntroTurnTarget | undefined;
  /** The stream body `drafts`. The stream reads it when it ends. */
  drafts: LabosAgentDraft[];
};

/**
 * `draft_intro` (LAB-3300, contract section 8.3). An agent tool only, not an MCP tool. Propose only: it reads the
 * sender rule and the target, and writes nothing (no IntroRequest row, no Telegram post, no cache entry). The member
 * edits the draft and sends it with C3. A refusal is a text for the model, and the turn has no draft.
 */
export function draftIntroTool(ctx: McpActorContext, deps: DraftDeps): CoreTool {
  return tool({
    description:
      'Write a draft intro request from the member to the member or team in the page context. ' +
      `The text is from ${MIN} to ${MAX} characters, in the voice of the member: who they are, what they ask, and why. ` +
      'The tool only makes a draft card. The member edits it and presses Send. Nothing is sent. ' +
      'Use it only for the intro target of this turn. When there is no target, ask the member to open ' +
      '"Ask the agent" from the member or team profile.',
    parameters: z.object({
      type: z.enum(['member', 'team']),
      targetUid: z.string(),
      text: z.string(),
    }),
    execute: async (args: { type: 'member' | 'team'; targetUid: string; text: string }) => {
      const target = deps.target;
      // 1. Only the target of this turn.
      if (!target || target.type !== args.type || target.uid !== args.targetUid) {
        return (
          'The draft was refused: the target is not the intro target of this turn. Make no draft. ' +
          'Ask the member to open "Ask the agent" from the profile of the member or team.'
        );
      }
      try {
        // 2. The C3 sender rule, the same code as C3.
        if (!(await deps.introRequests.findEligibleRequester(ctx.email))) return INTRO_NOT_ELIGIBLE_TEXT;
        // 3. The target name from the C3 lookup, not from the model.
        const name = await deps.introRequests.findTargetName(target.type === 'member' ? 'MEMBER' : 'TEAM', target.uid);
        if (!name) return `The draft was refused: the ${target.type} was not found. Make no draft.`;
        // 4. The limits of the intro modal.
        const text = (args.text ?? '').trim();
        if (text.length < MIN || text.length > MAX) {
          return (
            `The draft was refused: the text has ${text.length} characters. ` +
            `Write it again with ${MIN} to ${MAX} characters.`
          );
        }
        // 5. One draft per turn: a second call replaces the first.
        const draft: LabosAgentDraft = {
          draftId: `dr_${randomUUID()}`,
          kind: 'intro',
          target: { type: target.type, uid: target.uid, name },
          text,
          minLength: MIN,
          maxLength: MAX,
          source: 'agent',
        };
        deps.drafts.splice(0, deps.drafts.length, draft);
        return (
          `Draft ${draft.draftId} is ready for ${name}. Nothing is sent. ` +
          'Tell the member to check the draft, edit it if needed, and press Send.'
        );
      } catch (error) {
        return `The draft failed: ${error?.message ?? error}. Make no draft.`;
      }
    },
  });
}
