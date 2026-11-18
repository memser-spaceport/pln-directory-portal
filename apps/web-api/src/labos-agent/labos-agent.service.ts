import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LABOS_AGENT_ERROR_CODES, LabosAgentChatRequest } from 'libs/contracts/src/schema/labos-agent';
import { HuskyAiService } from '../husky/husky-ai.service';
import { newsRow, newsTools } from '../mcp/mcp-news-tools';
import { McpActorContext } from '../mcp/mcp-tools';
import { PrismaService } from '../shared/prisma.service';
import { resolveLiveMemberUidByEmail } from '../shared/resolve-live-member-uid.util';
import { TeamNewsQueryService } from '../team-news/team-news-query.service';
import { TeamNewsSuggestionsService } from '../team-news/team-news-suggestions.service';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { mcpToolsAsAgentTools } from './labos-agent-news.tools';

/** S1 tools next to the AI search tools (contract section 3). `visibility: always`, read only. */
const S1_MCP_TOOLS = ['list_news', 'get_news_item'];

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
    private teamNewsSuggestions: TeamNewsSuggestionsService
  ) {}

  async isEnabled(email: string | undefined): Promise<boolean> {
    return this.access.isEnabled(await resolveLiveMemberUidByEmail(this.prisma, email));
  }

  /** Runs the checks that come before the stream (403, 404), then returns the stream. */
  async chat(email: string, body: LabosAgentChatRequest): Promise<ReadableStream> {
    const memberUid = await resolveLiveMemberUidByEmail(this.prisma, email);
    if (!memberUid || !this.access.isEnabled(memberUid)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: LABOS_AGENT_ERROR_CODES.AGENT_NOT_ENABLED,
        message: 'The LabOS agent is not enabled for this member',
      });
    }

    const promptContext = await this.pageContext(body, memberUid);
    const ctx: McpActorContext = {
      memberUid,
      name: '',
      email,
      permissions: new Set(),
      authorizationUid: '',
      clientName: 'labos-agent',
      agentAccess: 'read',
    };
    const defs = newsTools(this.teamNewsQuery, this.teamNewsSuggestions).filter((def) =>
      S1_MCP_TOOLS.includes(def.name)
    );

    return this.huskyAiService.createContextualToolsResponse(
      { question: body.message, threadId: body.threadId, chatId: body.chatId },
      true,
      email,
      {
        promptContext,
        extraTools: mcpToolsAsAgentTools(defs, ctx),
        extraResponseFields: { proposals: [] },
        persistHistory: false,
      }
    );
  }

  private async pageContext(body: LabosAgentChatRequest, memberUid: string): Promise<string | undefined> {
    const context = body.context;
    if (!context) return undefined;
    if (context.page !== 'news-story' || !context.newsUid) {
      return 'The member is on the LabOS Home page.';
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
    return (
      'The member is reading this LabOS news story. "This story" means this item. ' +
      `Call get_news_item with uid ${row.uid} for its source before you answer about it. Story: ${JSON.stringify(
        story
      )}`
    );
  }
}
