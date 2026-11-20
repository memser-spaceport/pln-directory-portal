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

/** The answer line while the turn has a draft, else undefined. For `ContextualToolsOptions.answerLine`. */
export function introDraftLine(drafts: LabosAgentDraft[]): string | undefined {
  return drafts.length ? INTRO_DRAFT_LINE : undefined;
}

/** LAB-3362 D4: the intro draft of a turn, kept on the server for the next turns of the thread. Never streamed. */
export type IntroDraftNote = { target: IntroTurnTarget; text: string };

/** The cache key of the draft note: one for each member and thread, so another member never reads it. */
export function introDraftNoteKey(memberUid: string, threadId: string): string {
  return `labos-agent:intro-draft:${memberUid}:${threadId}`;
}

/** The note to store when the turn ends: the draft of the turn, or undefined (the earlier note stays). */
export function introDraftNote(drafts: LabosAgentDraft[]): string | undefined {
  const draft = drafts[0];
  if (!draft) return undefined;
  const note: IntroDraftNote = { target: draft.target, text: draft.text };
  return JSON.stringify(note);
}

/** The stored note, or undefined when there is none or it is not a valid note. */
export function parseIntroDraftNote(note: string | undefined): IntroDraftNote | undefined {
  if (!note) return undefined;
  try {
    const value = JSON.parse(note) as Partial<IntroDraftNote>;
    const target = value?.target;
    if (
      typeof value?.text !== 'string' ||
      !target ||
      (target.type !== 'member' && target.type !== 'team') ||
      typeof target.uid !== 'string' ||
      typeof target.name !== 'string'
    ) {
      return undefined;
    }
    return { target: { type: target.type, uid: target.uid, name: target.name }, text: value.text };
  } catch {
    return undefined;
  }
}

/** The prompt line with the last draft, so a follow-up such as "make it shorter" can change it. */
export function introDraftNotePrompt(note: IntroDraftNote): string {
  return (
    `The last intro draft of this thread is in the card, not in the answer: ${JSON.stringify(note)}. ` +
    'When the member asks to change the draft, for example to make it shorter, ' +
    `call draft_intro with type "${note.target.type}" and targetUid "${note.target.uid}" and the new text. ` +
    'Do not write the draft text in the answer.'
  );
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
          'Ask the member to open "Ask the agent" from the profile of the member or team.'
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
