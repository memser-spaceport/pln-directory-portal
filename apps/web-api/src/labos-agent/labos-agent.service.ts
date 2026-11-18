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
  LabosAgentProposal,
} from 'libs/contracts/src/schema/labos-agent';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { HuskyAiService } from '../husky/husky-ai.service';
import { IntroRequestsService } from '../intro-requests/intro-requests.service';
import { newsRow } from '../mcp/mcp-news-tools';
import { McpToolCatalog } from '../mcp/mcp-tool-catalog';
import { McpAdminCaps, McpScopesService } from '../mcp/mcp-scopes.service';
import { McpActorContext, McpToolDef } from '../mcp/mcp-tools';
import { PrismaService } from '../shared/prisma.service';
import { resolveLiveMemberUidByEmail } from '../shared/resolve-live-member-uid.util';
import { TeamNewsQueryService } from '../team-news/team-news-query.service';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { draftIntroTool, IntroTurnTarget } from './labos-agent-drafts';
import { mcpToolsAsAgentTools } from './labos-agent-news.tools';
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
    private introRequests: IntroRequestsService
  ) {}

  private readonly logger = new Logger(LabosAgentService.name);

  async isEnabled(email: string | undefined): Promise<boolean> {
    return this.access.isEnabled(await resolveLiveMemberUidByEmail(this.prisma, email));
  }

  /** Runs the checks that come before the stream (403, 404), then returns the stream. */
  async chat(email: string, body: LabosAgentChatRequest): Promise<ReadableStream> {
    const memberUid = await this.enabledMember(email);
    const { promptContext, introTarget } = await this.pageContext(body, memberUid);
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
    const draftIntro = draftIntroTool(ctx, { introRequests: this.introRequests, target: introTarget, drafts });

    return this.huskyAiService.createContextualToolsResponse(
      { question: body.message, threadId: body.threadId, chatId: body.chatId },
      true,
      email,
      {
        promptContext,
        extraTools: { ...mcpToolsAsAgentTools(reads, ctx), ...proposeTools, draft_intro: draftIntro },
        // The stream reads these arrays when it ends, so they hold the proposals and drafts the tools made in this turn.
        extraResponseFields: { proposals, drafts },
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
    if (!memberUid || !this.access.isEnabled(memberUid)) {
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
    memberUid: string
  ): Promise<{ promptContext?: string; introTarget?: IntroTurnTarget }> {
    const context = body.context;
    if (!context) return {};
    if (context.page === 'intro' && context.introTarget) return this.introContext(context.introTarget);
    if (context.page !== 'news-story' || !context.newsUid) {
      return { promptContext: 'The member is on the LabOS Home page.' };
    }
    const item = await this.teamNewsQuery.getTeamNewsItemDto(context.newsUid, new Set(), memberUid);
    if (!item) {
      throw new NotFoundException({
        statusCode: 404,
        code: LABOS_AGENT_ERROR_CODES.NEWS_NOT_FOUND,
        message: `News item not found: ${context.newsUid}`,
      });
    }
    const row = newsRow(item);
    const story = {
      uid: row.uid,
      title: row.title,
      summary: row.summary,
      teamName: row.teamName,
      eventDate: row.eventDate,
    };
    const promptContext =
      'The member is reading this LabOS news story. "This story" means this item. ' +
      `Call get_news_item with uid ${row.uid} for its source before you answer about it. Story: ${JSON.stringify(
        story
      )}`;
    return { promptContext };
  }

  /** The intro page (LAB-3300): the target from the C3 lookup, or 404 INTRO_TARGET_NOT_FOUND before the stream. */
  private async introContext(target: {
    type: 'member' | 'team';
    uid: string;
  }): Promise<{ promptContext: string; introTarget: IntroTurnTarget }> {
    const name = await this.introRequests.findTargetName(target.type === 'member' ? 'MEMBER' : 'TEAM', target.uid);
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

function summary(stored: StoredProposal): string {
  const labels = stored.proposal.changes.map((change) => change.label).join(', ');
  if (stored.tool === 'update_my_profile') return `Your profile is updated: ${labels}.`;
  if (stored.tool === 'add_experience') return 'The experience is added to your profile.';
  if (stored.tool === 'update_experience') return `Your experience is updated: ${labels}.`;
  return `${stored.proposal.title.replace(/^Update /, '')} is updated: ${labels}.`;
}
