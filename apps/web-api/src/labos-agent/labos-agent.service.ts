import {
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  LABOS_AGENT_ERROR_CODES,
  LABOS_AGENT_PROPOSE_TOOLS,
  LabosAgentChatRequest,
  LabosAgentClosedStatus,
  LabosAgentConfirmRequest,
  LabosAgentConfirmResponse,
  LabosAgentDraft,
  LabosAgentIntroDraft,
  LabosAgentMention,
  LabosAgentMentionsQuery,
  LabosAgentMentionsResponse,
  LabosAgentProposal,
} from 'libs/contracts/src/schema/labos-agent';
import { MEMBER_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { HuskyAiService, LATEST_REPLY_CACHE_TIMEOUT_MS } from '../husky/husky-ai.service';
import { IntroRequestsService } from '../intro-requests/intro-requests.service';
import { JobOpeningsQueryService } from '../job-openings/job-openings-query.service';
import { McpToolCatalog } from '../mcp/mcp-tool-catalog';
import { McpAdminCaps, McpScopesService } from '../mcp/mcp-scopes.service';
import { McpActorContext, McpToolDef } from '../mcp/mcp-tools';
import { PrismaService } from '../shared/prisma.service';
import { resolveLiveMemberUidByEmail } from '../shared/resolve-live-member-uid.util';
import { TeamNewsQueryService } from '../team-news/team-news-query.service';
import { TeamsService } from '../teams/teams.service';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { answerCounts } from './labos-agent-answer-counts';
import {
  ADD_THAT_LINE,
  DRAFT_FACTS_RULE,
  DRAFT_LIMITS_RULE,
  INTRO_DRAFT_REPLY_LABEL,
  INTRO_REASON_RULE,
  draftIntroTool,
  INTRO_DRAFT_LINE,
  INTRO_DRAFT_LINE_FORMS,
  introDraftLine,
  IntroTurnTarget,
  isBareAddThat,
  NO_CHANGE_LINE,
  ownClaims,
  PROFILE_READ_TOOLS,
  profileFacts,
} from './labos-agent-drafts';
import { chosenChip, keptTargetUse } from './labos-agent-intro-target';
import {
  asksAgainAfterFailure,
  asksForChange,
  ASK_WHAT_LINE,
  DRAFT_CARD_REPLY_LINE,
  isPastedText,
  isUnknownReply,
  namesNoTopic,
  lastAnswerTurn,
  WHICH_REPLY_LINE,
  withoutIntroHints,
} from './labos-agent-last-answer';
import { searchMentions } from './labos-agent-mentions';
import { mcpToolsAsAgentTools, newsLinkFields } from './labos-agent-news.tools';
import {
  HOME_MENTION_SENTENCE,
  JOB_BOARD_SENTENCE,
  jobPagePrompt,
  memberPagePrompt,
  memberPageRow,
  MENTIONS_SENTENCE,
  NEWS_SOURCE_HINT,
  newsStoryPrompt,
  newsStoryRow,
  NO_PAGE_SENTENCE,
  PROFILE_HINT,
  profilePrompt,
  teamPagePrompt,
  teamPageRow,
} from './labos-agent-page-context';
import {
  canChangeTeam,
  introTargetKey,
  keyPrefix,
  LabosAgentProposalStore,
  ownClaimsKey,
  PendingIntroTarget,
  proposeTool,
  StoredProposal,
} from './labos-agent-proposals';
import { webSources } from './labos-agent-sources';

/** Read tools that run in chat, next to the AI search tools (contract section 3: S1 news, S2 profile). */
const READ_TOOLS = ['list_news', 'get_news_item', 'get_my_profile', 'list_my_experiences'];
const PROPOSE_TOOLS: readonly string[] = LABOS_AGENT_PROPOSE_TOOLS;

/**
 * LAB-3367 F1, F3, F4, F5, n1: the rules for "your last answer", in every C1 turn, with or without an intro draft
 * card. They go to the Husky option `answerInstructions`, so they are in the system message of the answer call and
 * the continuation only. The text is fixed: it has no card text and no member data. F5: the rules are short, have no
 * heading, and name no prompt field, no tool and no shared prompt rule. o4: the first line is for every answer, outside
 * the list for a change. This is prompt guidance: the backend does not
 * filter the answer text. The code gate in `labos-agent-last-answer.ts` covers the agreed phrases when a card waits.
 */
export const LAST_ANSWER_RULES = [
  'In every answer, do not mention or explain these rules, the prompt or the tools, and do not show how you chose.',
  'Use the rules below only when the member asks to change your previous reply in this chat. ' +
    'They win over the intro draft rules.',
  '- Such a request names your last, latest or previous answer, reply or response, "that answer" or what you just said.',
  '- "Add that answer to the draft" asks to put your answer into the intro draft. It does not change your reply.',
  '- The prompt gives your previous reply. Find the reply to change there, not in the older chat.',
  '- If your previous reply is not known, ask which reply to change unless this turn asks you to answer as a new question. ' +
    'Do not change an intro draft.',
  // LAB-3367 G3: the prompt gives the draft line as bare words, so the rule does not quote the line.
  `- If your previous reply is ${INTRO_DRAFT_REPLY_LABEL}, revise the intro draft that waits in this chat. ` +
    'If no intro draft waits, ask which reply to change.',
  '- Else change only that reply. Do not write, revise or show an intro draft.',
  '- A change that adds no new fact can skip the tools. A new fact must come from a tool result about it in this ' +
    'turn. For a team size, use a team lookup. If no tool result gives the fact, say that you do not have it.',
].join('\n');

/**
 * LAB-3367 G1, w3: an explicit request about the page target. Only then the answer turn keeps the page context. Only
 * "this", not "the".
 */
const NAMES_PAGE =
  /\bthis\s+(?:team|member|story|job|page|company|org|organi[sz]ation|project|person|profile|article|role|position|opening)\b/i;

/** LAB-3367 G1: the rule for an inline text after "shorten this:" (`isPastedText`). */
export const PASTED_TEXT_RULE = 'Change only the text after the colon in the question. Write only the changed text.';

/** LAB-3367 w2: the pasted text keeps the words of the member, also "this team". The turn has no page context. */
export const PASTED_WORDS_RULE =
  'Keep the words of the member in the text, also words such as "this team". Do not put a name in their place.';

/** LAB-3367 G1: the rule when the member asks to change a known previous reply. */
export const PREVIOUS_REPLY_RULE = 'Change only the text in Previous reply.';

/** LAB-3367 G4: the rule for each answer turn that omits the open card. */
export const CARD_OPEN_RULE =
  'An intro draft card is open in the chat. This request is not about it. Do not say that there is no draft.';

/** LAB-3367 G7: the rule after a failed reply that is not known. The turn has no `Previous reply` line. */
export const ASK_AGAIN_RULE =
  'Your previous reply did not reach the member. Answer the message as a new question with the tools. ' +
  // LAB-3367 w1 (Oleg): the exact sentence. The turn also has no chat history and no draft tool.
  'If the message does not say what to answer, ask what to answer. Do not use an older request. ' +
  'When the message names a topic, answer only that topic. Do not write an intro draft.';

/**
 * LAB-3367 G1, G4, G7: the fixed rules of one turn after `LAST_ANSWER_RULES`. They have no member or card text.
 */
export function lastAnswerTurnRules(lines: string[]): string {
  return [LAST_ANSWER_RULES, ...lines].join('\n');
}

/**
 * LAB-3367 h3: the cache key of the latest agent reply for one member in one thread. The `<env>:labos-agent` prefix of
 * the proposal keys keeps environments that share a Redis apart. JSON keeps the key free of collisions for any C1
 * `threadId` string, and the namespace keeps it apart from the Husky `<threadId>:summary` key.
 */
export function latestReplyCacheKey(memberUid: string, threadId: string): string {
  return `${keyPrefix()}:latest-reply:${JSON.stringify([memberUid, threadId])}`;
}

function agentError(
  Exception: new (body: object) => HttpException,
  statusCode: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {}
) {
  return new Exception({ statusCode, code, message, ...extra });
}

/**
 * The LabOS in-app agent, chat turn (LAB-3298). It reuses the AI search stream and model
 * settings, adds the page context and the S1 news tools, and writes nothing.
 */
@Injectable()
export class LabosAgentService {
  constructor(
    private prisma: PrismaService,
    private access: LabosAgentAccessService,
    private huskyAiService: HuskyAiService,
    private teamNewsQuery: TeamNewsQueryService,
    private catalog: McpToolCatalog,
    private accessControl: AccessControlV2Service,
    private proposalStore: LabosAgentProposalStore,
    private scopes: McpScopesService,
    private introRequests: IntroRequestsService,
    private teams: TeamsService,
    private jobs: JobOpeningsQueryService
  ) {}

  private readonly logger = new Logger(LabosAgentService.name);

  async isEnabled(email: string | undefined): Promise<boolean> {
    return this.access.isEnabled(await resolveLiveMemberUidByEmail(this.prisma, email));
  }

  /**
   * C4 (LAB-3318, contract 10.2): the mention picker search. The gate comes first (403), so a member outside the gate
   * runs no search. A database search only: no model call, no write, no notification.
   */
  async mentions(email: string, query: LabosAgentMentionsQuery): Promise<LabosAgentMentionsResponse> {
    const memberUid = await this.enabledMember(email);
    const access = await this.accessControl.getMemberAccess(memberUid);
    return searchMentions(this.prisma, memberUid, new Set(access.effectivePermissions ?? []), query);
  }

  /** Runs the checks that come before the stream (403, 404), then returns the stream. */
  async chat(email: string, body: LabosAgentChatRequest): Promise<ReadableStream> {
    const memberUid = await this.enabledMember(email);
    const page = await this.pageContext(body, memberUid, email);
    // S6 (contract 10.4): the mention lookups come after the context lookup, so a bad context gives its 404 first.
    const mentioned = await this.mentionContext(body, memberUid, email);
    // Contract change 4 (LAB-3362, section 11): the waiting intro card, for this turn only. Nothing stores it.
    const card = body.introDraft ? await this.introDraftContext(body.introDraft) : undefined;
    // LAB-3367 B3: the intro target that the member chose wins over the page target until a draft is made.
    const targetKey = introTargetKey(memberUid, body.threadId);
    const claimsKey = ownClaimsKey(memberUid, body.threadId);
    const claims = ownClaims(body.message);
    const [chosen] = await Promise.all([
      this.chosenIntroTarget(body, page, mentioned.introTargets, card?.introTarget, targetKey),
      // LAB-3367 B4: the member's own claims, so a later revision can use them. Only a message with a claim writes.
      claims.length ? this.threadCache(() => this.proposalStore.addOwnClaims(claimsKey, claims)) : undefined,
    ]);
    const dropped = chosen?.hints ?? [];
    const basePromptContext =
      joinPrompt(
        withoutIntroHints(page.promptContext, dropped),
        withoutIntroHints(mentioned.promptContext, dropped),
        !body.context
      ) || undefined;
    const promptContext =
      [basePromptContext, chosen?.promptContext, card?.promptContext].filter(Boolean).join('\n') || undefined;
    const introTargets = uniqueTargets([
      ...(chosen ? chosen.targets : [...(page.introTarget ? [page.introTarget] : []), ...mentioned.introTargets]),
      ...(card ? [card.introTarget] : []),
    ]);
    const ctx = await this.actor(memberUid, email);
    // The member's real RBAC permissions and the admin MCP caps pick the tools, as on the MCP server (LAB-3299).
    const allowed = await this.tools(ctx);
    const reads = allowed.filter((def) => READ_TOOLS.includes(def.name));
    const proposals: LabosAgentProposal[] = [];
    const deps = {
      prisma: this.prisma,
      reads: new Map(reads.map((def) => [def.name, def])),
      store: this.proposalStore,
      proposals,
    };
    const proposeTools = Object.fromEntries(
      allowed.filter((def) => PROPOSE_TOOLS.includes(def.name)).map((def) => [def.name, proposeTool(def, ctx, deps)])
    );
    // S3 (LAB-3300): an agent-only tool, not in McpToolCatalog, so the admin MCP caps do not apply. It writes nothing.
    const drafts: LabosAgentDraft[] = [];
    const draftIntro = draftIntroTool(ctx, {
      introRequests: this.introRequests,
      targets: introTargets,
      drafts,
      readTools: reads.map((def) => def.name),
      // LAB-3367 B4: the claim check.
      card: body.introDraft
        ? { type: body.introDraft.target.type, uid: body.introDraft.target.uid, text: body.introDraft.text }
        : undefined,
      message: body.message,
      ownFacts: () => this.ownFacts(claimsKey, reads, ctx),
    });

    const extraTools = { ...mcpToolsAsAgentTools(reads, ctx), ...proposeTools, draft_intro: draftIntro };

    const stream = await this.huskyAiService.createContextualToolsResponse(
      { question: body.message, threadId: body.threadId, chatId: body.chatId },
      true,
      email,
      {
        // LAB-3362 D4: with a draft, the answer is one short line. The draft text is only in the card.
        answerLine: () => introDraftLine(drafts),
        promptContext,
        extraTools,
        // The stream reads these arrays when it ends, so they hold the proposals and drafts the tools made in this turn.
        extraResponseFields: { proposals, drafts },
        // LAB-3297 (V0-R4): `toolCount`, `usedWebSearch` and `sourceCount` at the end of the body. Counts only.
        // LAB-3362 D1: news `sourceRefs` link to `/?news=<uid>`, also the refs of the AI search news tool. LAB-3362 D2:
        // `sources` keeps only web pages outside LabOS that are not in `sourceRefs`. The counts use the same refs and
        // `sources` as the body.
        turnFields: (turn) => {
          const links = newsLinkFields(turn);
          const sources = webSources(turn.sources, links.sourceRefs ?? turn.sourceRefs);
          return { ...links, sources, ...answerCounts({ ...turn, ...links, sources }) };
        },
        persistHistory: false,
        // LAB-3367 h3: the latest reply, scoped to the signed-in member and the thread. Never the raw thread ID.
        latestReplyKey: latestReplyCacheKey(memberUid, body.threadId),
        // LAB-3367 k2, k7: the rules for your last answer, in the system message of the answer calls only.
        answerInstructions: LAST_ANSWER_RULES,
        // LAB-3367 F1, F3, K3: a code gate for the agreed phrases when a card waits (labos-agent-last-answer.ts).
        latestReplyTurn: (latestReply) => {
          // LAB-3367 B2 (Oleg): a bare "add that" right after a draft turn keeps the card, with a fixed answer.
          if (card && isBareAddThat(body.message) && latestReply.trim() === INTRO_DRAFT_LINE) {
            return {
              extraTools: Object.fromEntries(Object.entries(extraTools).filter(([name]) => name !== 'draft_intro')),
              answerLine: undefined,
              fixedAnswer: ADD_THAT_LINE,
            };
          }
          const kind = lastAnswerTurn(body.message, Boolean(card), latestReply);
          const pasted = isPastedText(body.message);
          // LAB-3367 G7, w1: after a failed reply that is not known, answer as a new question, with no Previous reply
          // line, no chat history and no draft tool, also with no card.
          const askAgain =
            kind !== 'which' && kind !== 'card' && !pasted && asksAgainAfterFailure(body.message, latestReply);
          // w2: a pasted text gets no page context and no draft tool, also with no card.
          if (kind === 'model' && !askAgain && !pasted) return {};
          // No draft tool and no card text, so this turn cannot change or show the draft (all paths below).
          const noDraft = {
            extraTools: Object.fromEntries(Object.entries(extraTools).filter(([name]) => name !== 'draft_intro')),
            answerLine: undefined,
          };
          // LAB-3367 o1: also no intro hint of the page or the mentions, as no text may name the missing tool.
          const hints = [...(page.introHints ?? []), ...(mentioned.introHints ?? [])];
          const fixedAnswer =
            kind === 'which'
              ? WHICH_REPLY_LINE
              : kind === 'card'
              ? DRAFT_CARD_REPLY_LINE
              : askAgain && namesNoTopic(body.message)
              ? ASK_WHAT_LINE
              : undefined;
          // G1, w2, w3: the page goes only when the message names it ("this team") and the text is not pasted. The intro
          // page context says that the member wants an intro, so it never goes to these turns.
          const pagePart =
            !pasted && body.context?.page !== 'intro' && NAMES_PAGE.test(body.message) ? page.promptContext : undefined;
          const answerContext = [pagePart, mentioned.promptContext].filter(Boolean).join('\n') || undefined;
          const recovery = askAgain ? { omitLatestReply: true, omitHistory: true } : {};
          if (fixedAnswer !== undefined) {
            return { promptContext: withoutIntroHints(answerContext, hints), ...noDraft, ...recovery, fixedAnswer };
          }
          const reply = latestReply.trim();
          const knownReply = !isUnknownReply(reply) && reply !== INTRO_DRAFT_LINE;
          const rules = [
            ...(card ? [CARD_OPEN_RULE] : []),
            ...(pasted
              ? [PASTED_TEXT_RULE, PASTED_WORDS_RULE]
              : askAgain
              ? [ASK_AGAIN_RULE]
              : knownReply && asksForChange(body.message)
              ? [PREVIOUS_REPLY_RULE]
              : []),
          ];
          return {
            promptContext: withoutIntroHints(answerContext, hints),
            ...noDraft,
            answerInstructions: lastAnswerTurnRules(rules),
            ...recovery,
          };
        },
        // LAB-3367: model text that is only the draft line is not a draft turn.
        reservedReply: INTRO_DRAFT_LINE,
        // LAB-3367 t7b, t1: the other forms of the draft line, and the answer when no text is left.
        reservedReplyForms: INTRO_DRAFT_LINE_FORMS,
        emptyReplyLine: NO_CHANGE_LINE,
        // LAB-3367 G3: the stored draft line goes to the prompt as bare words.
        reservedReplyLabel: INTRO_DRAFT_REPLY_LABEL,
      }
    );
    if (!chosen?.keeps) return stream;
    // LAB-3367 X1: the kept target goes when the turn ends with a draft. A stopped or failed turn keeps it, because the
    // member got no card. A revision of the waiting card is not a draft for the kept target.
    return stream.pipeThrough(
      new TransformStream({
        flush: async () => {
          if (drafts.some((draft) => !sameTarget(draft.target, card?.introTarget))) {
            await this.threadCache(() => this.proposalStore.clearIntroTarget(targetKey));
          }
        },
      })
    );
  }

  /**
   * LAB-3367 B3 (Oleg): the intro targets of the turn when the member chose a target, or undefined for the page and the
   * chips. A chosen chip (`chosenChip`) is kept until a draft is made, the TTL ends, the member moves to another page or
   * the message names another recipient (`keptTargetUse`). See the OpenSpec B3 rule.
   */
  private async chosenIntroTarget(
    body: LabosAgentChatRequest,
    page: { introTarget?: IntroTurnTarget; introHints?: string[] },
    chips: IntroTurnTarget[],
    cardTarget: IntroTurnTarget | undefined,
    key: string
  ): Promise<{ targets: IntroTurnTarget[]; promptContext?: string; hints: string[]; keeps: boolean } | undefined> {
    const pageHints = page.introHints ?? [];
    const pageKey = JSON.stringify(body.context ?? null);
    const others = chips.filter((item) => !sameTarget(item, page.introTarget) && !sameTarget(item, cardTarget));
    const chip = body.context?.page === 'intro' ? undefined : chosenChip(body.message, others, page.introTarget);
    if (chip) {
      const pending: PendingIntroTarget = { type: chip.type, uid: chip.uid, page: pageKey };
      await this.threadCache(() => this.proposalStore.saveIntroTarget(key, pending));
      const otherHints = others.filter((item) => item !== chip).map((item) => introHint(item.type, item.uid));
      return { targets: [chip], hints: [...pageHints, ...otherHints], keeps: true };
    }
    const pending = await this.threadCache(() => this.proposalStore.loadIntroTarget(key));
    if (!pending) return undefined;
    const drop = () => this.threadCache(() => this.proposalStore.clearIntroTarget(key));
    const moved = pending.page !== pageKey;
    // A waiting card for the kept target: its draft is made.
    const name =
      moved || sameTarget(pending, cardTarget)
        ? null
        : await this.introRequests.findAgentTargetName(pending.type === 'member' ? 'MEMBER' : 'TEAM', pending.uid);
    const target: IntroTurnTarget = { type: pending.type, uid: pending.uid, name: name ?? '' };
    const use = name ? keptTargetUse(body.message, target, page.introTarget) : 'page';
    if (use === 'page') {
      await drop();
      return undefined;
    }
    if (use === 'drop') {
      await drop();
      return { targets: others, hints: pageHints, keeps: false };
    }
    const both = !!page.introTarget && (use === 'both' || !!pending.both);
    if (both && !pending.both) {
      await this.threadCache(() => this.proposalStore.saveIntroTarget(key, { ...pending, both: true }));
    }
    const promptContext =
      `Earlier in this chat, the member asked for an intro to this ${target.type}: ${JSON.stringify(target)}. ` +
      (both
        ? 'The page is also an intro target. Use the one that the member means. If it is not clear, ask which one. '
        : 'It is the intro target of this turn, not the page. ') +
      `When the member gives the reason for this intro, call draft_intro with type "${target.type}" and ` +
      `targetUid "${target.uid}". If the message is about something else, answer it and make no draft. ` +
      `${INTRO_REASON_RULE} You never send the request.`;
    return {
      targets: [target, ...(both && page.introTarget ? [page.introTarget] : []), ...others],
      promptContext,
      hints: both ? [] : pageHints,
      keeps: true,
    };
  }

  /**
   * LAB-3367 B4: the own facts of the member for the claim check: the claims of their earlier messages in the thread,
   * and their LabOS profile through the read tools of the turn. A part that fails gives no facts, so the check refuses.
   */
  private async ownFacts(claimsKey: string, reads: McpToolDef[], ctx: McpActorContext): Promise<string[]> {
    const profile = reads.filter((def) => (PROFILE_READ_TOOLS as readonly string[]).includes(def.name));
    const parts = await Promise.all([
      this.threadCache(() => this.proposalStore.loadOwnClaims(claimsKey)),
      ...profile.map((def) =>
        def.execute(ctx, {}).then(profileFacts, () => {
          this.logger.error(`Failed to read ${def.name} for the claim check of a LabOS agent draft`);
          return undefined;
        })
      ),
    ]);
    return parts.flatMap((part) => part ?? []);
  }

  /**
   * LAB-3367 B3, B4: one cache step of the kept target or the own claims. It waits at most 1 second, as the latest
   * reply steps. A failure or a timeout logs a fixed text (a Redis error can hold the arguments) and gives undefined.
   */
  private async threadCache<T>(step: () => Promise<T>): Promise<T | undefined> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), this.threadCacheTimeoutMs);
      timer.unref?.();
    });
    try {
      return await Promise.race([step(), timeout]);
    } catch {
      this.logger.error('Failed to read or write the intro state of the LabOS agent thread');
      return undefined;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** A field, so a test can make it short. */
  private threadCacheTimeoutMs = LATEST_REPLY_CACHE_TIMEOUT_MS;

  /**
   * C2: closes a proposal. Cancel writes nothing. Confirm checks the member's current permissions again, then runs
   * the real MCP tool once with the stored arguments.
   */
  async confirm(email: string, body: LabosAgentConfirmRequest): Promise<LabosAgentConfirmResponse> {
    const memberUid = await this.enabledMember(email);
    const stored = await this.proposalStore.load(body.proposalId);
    if (!stored || stored.memberUid !== memberUid) {
      throw agentError(NotFoundException, 404, LABOS_AGENT_ERROR_CODES.PROPOSAL_NOT_FOUND, 'Proposal not found');
    }
    if (stored.status !== 'open') throw this.closedError(stored.status);
    if (Date.now() > Date.parse(stored.proposal.expiresAt)) {
      throw agentError(GoneException, 410, LABOS_AGENT_ERROR_CODES.PROPOSAL_EXPIRED, 'The proposal expired');
    }
    const reply = { proposalId: stored.proposal.proposalId, tool: stored.tool };

    if (body.decision === 'cancel') {
      if (!(await this.proposalStore.claim(body.proposalId))) throw await this.lostClaim(body.proposalId);
      await this.proposalStore.close(stored, 'cancelled');
      return { ...reply, status: 'cancelled', summary: 'Cancelled. Nothing changed.', result: {} };
    }

    const ctx = await this.actor(memberUid, email);
    // The same tools as the chat: RBAC and admin caps now (an admin may have set the scope to read since the turn).
    const def = (await this.tools(ctx)).find((item) => item.name === stored.tool);
    const allowed =
      !!def && (stored.tool !== 'update_team' || (await canChangeTeam(this.prisma, ctx, String(stored.args.teamUid))));
    if (!allowed) throw this.notAllowed('You cannot do this action now');
    // Claim before the write: only one confirm runs the tool.
    if (!(await this.proposalStore.claim(body.proposalId))) throw await this.lostClaim(body.proposalId);

    let result: Record<string, unknown>;
    try {
      result = await def.execute(ctx, stored.args);
    } catch (error) {
      await this.proposalStore.close(stored, 'failed');
      const status = error instanceof HttpException ? error.getStatus() : 500;
      if (status === 403) throw this.notAllowed(error.message);
      if (status >= 400 && status < 500) {
        throw agentError(UnprocessableEntityException, 422, LABOS_AGENT_ERROR_CODES.ACTION_FAILED, error.message);
      }
      throw error;
    }
    await this.proposalStore.close(stored, 'done');
    return { ...reply, status: 'done', summary: summary(stored), result };
  }

  /**
   * The MCP tools for the member: RBAC (`forPermissions`) and the admin MCP caps (`planTools`), from McpToolCatalog.
   * Unreadable caps hide every scoped tool, so the chat gets no LabOS tools and C2 refuses: fail closed, as on MCP.
   */
  private async tools(ctx: McpActorContext): Promise<McpToolDef[]> {
    let caps: McpAdminCaps | null = null;
    try {
      caps = await this.scopes.adminCaps();
    } catch (error) {
      this.logger.error(`MCP scope settings unavailable for the LabOS agent: ${String(error)}`);
    }
    return this.catalog.forApp(ctx.permissions, caps);
  }

  /** 409 with the stored status, so a retry knows the outcome (`done`, `cancelled`, `failed`). */
  private closedError(status: LabosAgentClosedStatus) {
    return agentError(ConflictException, 409, LABOS_AGENT_ERROR_CODES.PROPOSAL_CLOSED, 'The proposal is closed', {
      status,
    });
  }

  /** Another request closed the proposal first. `pending` means its write has not finished yet. */
  private async lostClaim(proposalId: string) {
    const status = (await this.proposalStore.load(proposalId))?.status;
    return this.closedError(!status || status === 'open' ? 'pending' : status);
  }

  private notAllowed(message: string) {
    return agentError(ForbiddenException, 403, LABOS_AGENT_ERROR_CODES.ACTION_NOT_ALLOWED, message);
  }

  /** The live member behind the email, inside the pilot gate (403 AGENT_NOT_ENABLED otherwise). */
  private async enabledMember(email: string): Promise<string> {
    const memberUid = await resolveLiveMemberUidByEmail(this.prisma, email);
    if (!memberUid || !(await this.access.isEnabled(memberUid))) {
      throw agentError(
        ForbiddenException,
        403,
        LABOS_AGENT_ERROR_CODES.AGENT_NOT_ENABLED,
        'The LabOS agent is not enabled for this member'
      );
    }
    return memberUid;
  }

  /** The member as the MCP server sees them: the same effective RBAC permissions (no RBAC change). */
  private async actor(memberUid: string, email: string): Promise<McpActorContext> {
    const access = await this.accessControl.getMemberAccess(memberUid);
    return {
      memberUid,
      name: '',
      email,
      permissions: new Set(access.effectivePermissions ?? []),
      authorizationUid: '',
      clientName: 'labos-agent',
      agentAccess: 'read',
    };
  }

  private async pageContext(
    body: LabosAgentChatRequest,
    memberUid: string,
    email: string
  ): Promise<{ promptContext?: string; introTarget?: IntroTurnTarget; introHints?: string[] }> {
    const context = body.context;
    if (!context) return {};
    if (context.page === 'intro' && context.introTarget) return this.introContext(context.introTarget);
    // S5 (LAB-3302, contract 9.3 and 9.4). The own member comes from the session, never from the body.
    if (context.page === 'profile' || (context.page === 'member' && context.memberUid === memberUid)) {
      return { promptContext: profilePrompt(memberUid) };
    }
    if (context.page === 'member' && context.memberUid) {
      const promptContext = await memberPagePrompt(this.prisma, context.memberUid);
      return this.withPageIntroTarget(promptContext, 'member', context.memberUid);
    }
    if (context.page === 'team' && context.teamUid) {
      const promptContext = await teamPagePrompt(this.teams, this.prisma, context.teamUid, email);
      return this.withPageIntroTarget(promptContext, 'team', context.teamUid);
    }
    if (context.page === 'job') {
      if (!context.jobUid) return { promptContext: JOB_BOARD_SENTENCE };
      return { promptContext: await jobPagePrompt(this.jobs, context.jobUid, email) };
    }
    if (context.page !== 'news-story' || !context.newsUid) {
      return { promptContext: 'The member is on the LabOS Home page.' };
    }
    return { promptContext: newsStoryPrompt(await newsStoryRow(this.teamNewsQuery, context.newsUid, memberUid)) };
  }

  /**
   * S6 (LAB-3318, contract 10.4 and 10.6): the mention items of the turn. The items come from `mentions`, never from the
   * message text. One item list: `context` first, then `mentions`; a later item with the key of an earlier item is
   * dropped before its lookup. The lookups run in array order with the S5 rules, and the first 404 stops the turn with
   * `mentionIndex`. The resolvers only read: no write and no notification.
   */
  private async mentionContext(
    body: LabosAgentChatRequest,
    memberUid: string,
    email: string
  ): Promise<{ promptContext?: string; introTargets: IntroTurnTarget[]; introHints?: string[] }> {
    const seen = new Set<string>();
    const contextKey = pageItemKey(body.context, memberUid);
    if (contextKey) seen.add(contextKey);
    const kept: Array<{ mention: LabosAgentMention; index: number }> = [];
    (body.mentions ?? []).forEach((mention, index) => {
      const key = mentionItemKey(mention, memberUid);
      if (seen.has(key)) return;
      seen.add(key);
      kept.push({ mention, index });
    });
    if (!kept.length) return { introTargets: [] };
    // C4 rule (contract 10.2.2): a member item needs `member.search.read`. Read the permissions once, only when needed.
    const permissions = kept.some(({ mention }) => mention.type === 'member' && mention.uid !== memberUid)
      ? new Set((await this.accessControl.getMemberAccess(memberUid)).effectivePermissions ?? [])
      : new Set<string>();

    const lines: string[] = [];
    const targets: Array<{ type: 'member' | 'team'; uid: string; line: number }> = [];
    for (const { mention, index } of kept) {
      const n = lines.length + 1;
      try {
        lines.push(await this.mentionLine(mention, n, memberUid, email, permissions));
      } catch (error) {
        throw withMentionIndex(error, index);
      }
      if ((mention.type === 'member' && mention.uid !== memberUid) || mention.type === 'team') {
        targets.push({ type: mention.type, uid: mention.uid, line: lines.length - 1 });
      }
    }
    // S5 9.5 rule for each member and team item: an intro target when the S3 agent lookup gives a name.
    const introTargets: IntroTurnTarget[] = [];
    const introHints: string[] = [];
    for (const target of targets) {
      const name = await this.introRequests.findAgentTargetName(
        target.type === 'member' ? 'MEMBER' : 'TEAM',
        target.uid
      );
      if (!name) continue;
      introTargets.push({ type: target.type, uid: target.uid, name });
      const hint = introHint(target.type, target.uid);
      lines[target.line] += hint;
      introHints.push(hint);
    }
    return { promptContext: [MENTIONS_SENTENCE, ...lines].join('\n'), introTargets, introHints };
  }

  /** One line for a mention: `Item <n> (<type>): <row>`, with the S5 rows and the S1 story row (contract 10.6). */
  private async mentionLine(
    mention: LabosAgentMention,
    n: number,
    memberUid: string,
    email: string,
    permissions: Set<string>
  ): Promise<string> {
    if (mention.type === 'page' || (mention.type === 'member' && mention.uid === memberUid)) {
      const page = mention.type === 'page' ? mention.page : 'profile';
      if (page === 'profile') return `Item ${n} (page): ${JSON.stringify({ uid: memberUid })} ${PROFILE_HINT}`;
      if (page === 'job') return `Item ${n} (page): ${JOB_BOARD_SENTENCE}`;
      return `Item ${n} (page): ${HOME_MENTION_SENTENCE}`;
    }
    if (mention.type === 'member') {
      // LAB-3318 review: without `member.search.read` the member is hidden, as in C4. 404 does not tell that it exists.
      if (!permissions.has(MEMBER_PERMISSIONS.SEARCH_READ)) {
        throw agentError(
          NotFoundException,
          404,
          LABOS_AGENT_ERROR_CODES.MEMBER_NOT_FOUND,
          `Member not found: ${mention.uid}`
        );
      }
      return `Item ${n} (member): ${JSON.stringify(await memberPageRow(this.prisma, mention.uid))}`;
    }
    if (mention.type === 'team') {
      return `Item ${n} (team): ${JSON.stringify(await teamPageRow(this.teams, this.prisma, mention.uid, email))}`;
    }
    const story = await newsStoryRow(this.teamNewsQuery, mention.uid, memberUid);
    return `Item ${n} (news): ${JSON.stringify(story)} ${NEWS_SOURCE_HINT}`;
  }

  /**
   * Contract 9.5 (Q1 A): on a member or team page, the page target is also the intro target of the turn. The name
   * comes from the S3 agent lookup (`findAgentTargetName`), so the S3 rules stay: a deleted team gives no intro
   * target, also for an admin who can read the page. No name is not an error; `draft_intro` then refuses.
   */
  private async withPageIntroTarget(
    promptContext: string,
    type: 'member' | 'team',
    uid: string
  ): Promise<{ promptContext: string; introTarget?: IntroTurnTarget; introHints?: string[] }> {
    const name = await this.introRequests.findAgentTargetName(type === 'member' ? 'MEMBER' : 'TEAM', uid);
    if (!name) return { promptContext };
    const hint = introHint(type, uid);
    return { promptContext: `${promptContext}${hint}`, introTarget: { type, uid, name }, introHints: [hint] };
  }

  /**
   * Contract change 4 (section 11.2, 11.3): the target of the waiting card from the agent lookup (8.1), or 404
   * INTRO_TARGET_NOT_FOUND before the stream. The card text goes only into the prompt context of this turn: no cache
   * key, no log line, no analytics event (11.4). `draft_intro` checks the sender and the target again.
   */
  private async introDraftContext(
    draft: LabosAgentIntroDraft
  ): Promise<{ promptContext: string; introTarget: IntroTurnTarget }> {
    const { type, uid } = draft.target;
    const name = await this.introRequests.findAgentTargetName(type === 'member' ? 'MEMBER' : 'TEAM', uid);
    if (!name) {
      throw agentError(
        NotFoundException,
        404,
        LABOS_AGENT_ERROR_CODES.INTRO_TARGET_NOT_FOUND,
        `Intro target not found: ${type} ${uid}`
      );
    }
    const introTarget: IntroTurnTarget = { type: type as IntroTurnTarget['type'], uid, name };
    const promptContext =
      `An intro draft card waits in this chat, for this ${type}: ${JSON.stringify(introTarget)}. ` +
      `Its current text, with the edits of the member: ${JSON.stringify(draft.text)}. ` +
      'Use this text only when the member asks to change the draft. ' +
      `Then call draft_intro with type "${type}" and targetUid "${uid}" and the new text. ` +
      // LAB-3367: R2 brief revision = this draft; R4 a name in the edit = new text; R3 other draft or content wins.
      'If the member makes a brief revision request such as "make it shorter" and does not ask to change your last ' +
      'answer, revise this draft. ' +
      'This rule applies also when the page or the items added to the message point to another member or team. ' +
      'A member or team name in the revision, such as "mention that I know Acme Team", is part of the new text. ' +
      'It does not change the target. ' +
      // LAB-3367 Q1 (h2), s4: keep the facts of the current text. The same fact rule as the draft_intro description.
      'In a revision, keep the facts of the current text: the member may have typed them. ' +
      `${DRAFT_FACTS_RULE} ` +
      // LAB-3367 G8: the same draft limits as the draft_intro description.
      `${DRAFT_LIMITS_RULE} ` +
      'A fact from an earlier message of the member in this chat is in the words of the member. ' +
      'When the member says "add that", keep that fact in the draft. ' +
      // LAB-3367 F1, k1: the rules for your last answer (LAST_ANSWER_RULES, in the system message) win. Prompt guidance.
      'If the member asks to change your last answer, the rules for your last answer apply, and they win over this ' +
      'draft. ' +
      'A brief revision request that does not name your last answer revises this draft. ' +
      'If the member asks for a different draft or asks to change other content instead, follow that request. ' +
      'Do not use this draft text for that request. ' +
      'Example: "write the intro to Acme Team instead" with Acme Team in the items added to the message. ' +
      // LAB-3367 F2 (live QA): no new targets. A name alone is not a target.
      'A draft for a different member or team needs a target of this turn: the page, the items added to the message ' +
      'or this card. ' +
      'If the member gives only a name, and that member or team is not a target of this turn, do not call ' +
      'draft_intro for it. Ask the member to @mention that member or team in the message. ' +
      'Do not write the draft text in the answer.';
    return { promptContext, introTarget };
  }

  /** The intro page (LAB-3300): the target from the agent lookup (deleted teams are unknown), or 404 INTRO_TARGET_NOT_FOUND before the stream. */
  private async introContext(target: {
    type: 'member' | 'team';
    uid: string;
  }): Promise<{ promptContext: string; introTarget: IntroTurnTarget; introHints: string[] }> {
    const name = await this.introRequests.findAgentTargetName(target.type === 'member' ? 'MEMBER' : 'TEAM', target.uid);
    if (!name) {
      throw agentError(
        NotFoundException,
        404,
        LABOS_AGENT_ERROR_CODES.INTRO_TARGET_NOT_FOUND,
        `Intro target not found: ${target.type} ${target.uid}`
      );
    }
    const introTarget = { type: target.type, uid: target.uid, name };
    // LAB-3367 o1: the hint is all the text after the first sentence, so a turn without `draft_intro` can drop it.
    const hint =
      ` To write the draft, call draft_intro with type "${target.type}" and targetUid "${target.uid}". ` +
      `${INTRO_REASON_RULE} ` +
      'You never send the request. The member edits the draft and presses Send.';
    const promptContext = `The member wants to request an intro to this ${target.type}: ${JSON.stringify(
      introTarget
    )}.${hint}`;
    return { promptContext, introTarget, introHints: [hint] };
  }
}

/**
 * The intro hint of a page or mention target (contract 9.5, 10.6). LAB-3367 o1: one function for the text, so a turn
 * without `draft_intro` removes the same text.
 */
function introHint(type: 'member' | 'team', uid: string): string {
  return (
    ` When the member asks for an intro request to this ${type}, ` +
    `call draft_intro with type "${type}" and targetUid "${uid}". ` +
    // LAB-3367 G8: the same reason rule on each page, as on the intro page.
    `${INTRO_REASON_RULE} You never send the request.`
  );
}

/** The dedupe key of the `context` item (contract 10.4). The `intro` page and a job post have no mention key. */
function pageItemKey(context: LabosAgentChatRequest['context'], memberUid: string): string | undefined {
  if (!context) return undefined;
  if (context.page === 'profile' || (context.page === 'member' && context.memberUid === memberUid)) return 'profile';
  if (context.page === 'member') return `member:${context.memberUid}`;
  if (context.page === 'team') return `team:${context.teamUid}`;
  if (context.page === 'news-story') return `news:${context.newsUid}`;
  if (context.page === 'job') return context.jobUid ? undefined : 'job';
  if (context.page === 'home') return 'home';
  return undefined;
}

/** The dedupe key of a mention. The own member uid is the `profile` item. */
function mentionItemKey(mention: LabosAgentMention, memberUid: string): string {
  if (mention.type === 'page') return mention.page;
  if (mention.type === 'member' && mention.uid === memberUid) return 'profile';
  return `${mention.type}:${mention.uid}`;
}

/** A 404 of a mention lookup gets `mentionIndex`: the 0-based index of the item in `mentions`. */
function withMentionIndex(error: unknown, index: number): unknown {
  if (!(error instanceof NotFoundException)) return error;
  const body = error.getResponse();
  if (typeof body !== 'object' || body === null) return error;
  return new NotFoundException({ ...body, mentionIndex: index });
}

/**
 * The prompt context of the turn (contract 10.6): the S5 page text first, then the mention lines. With no context and
 * no mentions, the no-page sentence, so the model does not claim that it read a page.
 */
function joinPrompt(page: string | undefined, mentioned: string | undefined, noContext: boolean): string | undefined {
  if (!page && !mentioned) return noContext ? NO_PAGE_SENTENCE : undefined;
  return [page, mentioned].filter(Boolean).join('\n');
}

function sameTarget(a: { type: string; uid: string }, b: { type: string; uid: string } | undefined): boolean {
  return !!b && a.type === b.type && a.uid === b.uid;
}

/** One target for each type and uid, in order. */
function uniqueTargets(targets: IntroTurnTarget[]): IntroTurnTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.type}:${target.uid}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summary(stored: StoredProposal): string {
  const labels = stored.proposal.changes.map((change) => change.label).join(', ');
  if (stored.tool === 'update_my_profile') return `Your profile is updated: ${labels}.`;
  if (stored.tool === 'add_experience') return 'The experience is added to your profile.';
  if (stored.tool === 'update_experience') return `Your experience is updated: ${labels}.`;
  return `${stored.proposal.title.replace(/^Update /, '')} is updated: ${labels}.`;
}
