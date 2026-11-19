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
import { draftIntroTool, IntroTurnTarget } from './labos-agent-drafts';
import { searchMentions } from './labos-agent-mentions';
import { mcpToolsAsAgentTools } from './labos-agent-news.tools';
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
import { canChangeTeam, LabosAgentProposalStore, proposeTool, StoredProposal } from './labos-agent-proposals';

/** Read tools that run in chat, next to the AI search tools (contract section 3: S1 news, S2 profile). */
const READ_TOOLS = ['list_news', 'get_news_item', 'get_my_profile', 'list_my_experiences'];
const PROPOSE_TOOLS: readonly string[] = LABOS_AGENT_PROPOSE_TOOLS;

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
    const promptContext = joinPrompt(page.promptContext, mentioned.promptContext, !body.context);
    const introTargets = uniqueTargets([...(page.introTarget ? [page.introTarget] : []), ...mentioned.introTargets]);
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
        promptContext,
        extraTools: { ...mcpToolsAsAgentTools(reads, ctx), ...proposeTools, draft_intro: draftIntro },
        // The stream reads these arrays when it ends, so they hold the proposals and drafts the tools made in this turn.
        extraResponseFields: { proposals, drafts },
        // LAB-3297 (V0-R4): `toolCount`, `usedWebSearch` and `sourceCount` at the end of the body. Counts only.
        turnFields: answerCounts,
        persistHistory: false,
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
