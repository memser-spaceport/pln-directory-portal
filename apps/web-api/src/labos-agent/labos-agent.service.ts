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
import { HuskyAiService } from '../husky/husky-ai.service';
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
import { draftIntroTool, INTRO_DRAFT_LINE, introDraftLine, IntroTurnTarget } from './labos-agent-drafts';
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
  keyPrefix,
  LabosAgentProposalStore,
  proposeTool,
  StoredProposal,
} from './labos-agent-proposals';
import { webSources } from './labos-agent-sources';

/** Read tools that run in chat, next to the AI search tools (contract section 3: S1 news, S2 profile). */
const READ_TOOLS = ['list_news', 'get_news_item', 'get_my_profile', 'list_my_experiences'];
const PROPOSE_TOOLS: readonly string[] = LABOS_AGENT_PROPOSE_TOOLS;

/**
 * LAB-3367 F1, F3, F4 (live QA of #3774): the rules for "your last answer" in every C1 turn, with or without an intro
 * draft card. They win over the draft defaults. The Husky stream gives `latestReply` as JSON text, or the bare word
 * `unknown` when the latest reply is not known. Prompt guidance: the backend does not check the choice of the model.
 */
export const LAST_ANSWER_RULES =
  'Apply these rules only when the member asks to change your last answer. ' +
  'These rules win over every rule for an intro draft. ' +
  'latestReply is your latest reply in this chat. Do not use chatHistory to choose which reply to change. ' +
  'The value latestReply: unknown means that your latest reply is not known, for example after the member stopped it. ' +
  'A request names your last answer when it says "your last answer", "that answer" or "your last reply". ' +
  'If the request names your last answer and latestReply is a normal answer, change that answer. ' +
  'Then do not call draft_intro, and do not change an intro draft. ' +
  `If the request names your last answer and latestReply is the draft line "${INTRO_DRAFT_LINE}", ` +
  'revise the intro draft card that waits in this chat. ' +
  'In that draft-line case, if no card waits, ask which reply to change and do not call draft_intro. ' +
  'If the request names your last answer and latestReply is unknown or missing, ask which reply to change. ' +
  'Then do not call draft_intro, and leave an intro draft unchanged.';

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
    // LAB-3367 F1, F3, F4: the rules for your last answer come last, in every turn, also with no card.
    const promptContext = [
      joinPrompt(page.promptContext, mentioned.promptContext, !body.context),
      card?.promptContext,
      LAST_ANSWER_RULES,
    ]
      .filter(Boolean)
      .join('\n');
    const introTargets = uniqueTargets([
      ...(page.introTarget ? [page.introTarget] : []),
      ...mentioned.introTargets,
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
    const draftIntro = draftIntroTool(ctx, { introRequests: this.introRequests, targets: introTargets, drafts });

    return this.huskyAiService.createContextualToolsResponse(
      { question: body.message, threadId: body.threadId, chatId: body.chatId },
      true,
      email,
      {
        // LAB-3362 D4: with a draft, the answer is one short line. The draft text is only in the card.
        answerLine: () => introDraftLine(drafts),
        promptContext,
        extraTools: { ...mcpToolsAsAgentTools(reads, ctx), ...proposeTools, draft_intro: draftIntro },
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
      }
    );
  }

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
  ): Promise<{ promptContext?: string; introTarget?: IntroTurnTarget }> {
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
  ): Promise<{ promptContext?: string; introTargets: IntroTurnTarget[] }> {
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
    for (const target of targets) {
      const name = await this.introRequests.findAgentTargetName(
        target.type === 'member' ? 'MEMBER' : 'TEAM',
        target.uid
      );
      if (!name) continue;
      introTargets.push({ type: target.type, uid: target.uid, name });
      lines[target.line] +=
        ` When the member asks for an intro request to this ${target.type}, ` +
        `call draft_intro with type "${target.type}" and targetUid "${target.uid}". You never send the request.`;
    }
    return { promptContext: [MENTIONS_SENTENCE, ...lines].join('\n'), introTargets };
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
  ): Promise<{ promptContext: string; introTarget?: IntroTurnTarget }> {
    const name = await this.introRequests.findAgentTargetName(type === 'member' ? 'MEMBER' : 'TEAM', uid);
    if (!name) return { promptContext };
    return {
      promptContext:
        `${promptContext} When the member asks for an intro request to this ${type}, ` +
        `call draft_intro with type "${type}" and targetUid "${uid}". You never send the request.`,
      introTarget: { type, uid, name },
    };
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
      'If the member makes a brief revision request such as "make it shorter" and does not name your last answer, ' +
      'revise this draft. ' +
      'This rule applies also when the page or the items added to the message point to another member or team. ' +
      'A member or team name in the revision, such as "mention that I know Acme Team", is part of the new text. ' +
      'It does not change the target. ' +
      // LAB-3367 Q1 (h2): keep the facts of the current text, add no facts that the member did not give.
      'In a revision, keep the facts of the current text: the member may have typed them. ' +
      'Add only facts the member gave. ' +
      'Do not add or strengthen a role, shared work, experience or that someone can vouch for the member, ' +
      'when the member did not give it. ' +
      // LAB-3367 F1 (h1, h3, live QA of #3774): `latestReply` is the cached latest reply of this member in this thread.
      // The rules for your last answer (LAST_ANSWER_RULES, in every C1 turn) win over this draft. Prompt guidance.
      'If the member names your last answer, the rules for your last answer apply. They win over this draft. ' +
      `If latestReply is the draft line "${INTRO_DRAFT_LINE}", your last answer is this draft: revise this draft. ` +
      'If latestReply is a normal answer, change that answer and do not change this draft. ' +
      'If latestReply is unknown or missing, ask which reply to change and leave this draft unchanged. ' +
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
  }): Promise<{ promptContext: string; introTarget: IntroTurnTarget }> {
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
    const promptContext =
      `The member wants to request an intro to this ${target.type}: ${JSON.stringify(introTarget)}. ` +
      `To write the draft, call draft_intro with type "${target.type}" and targetUid "${target.uid}". ` +
      'Ask the member for the reason when the message does not give one. ' +
      'You never send the request. The member edits the draft and presses Send.';
    return { promptContext, introTarget };
  }
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
