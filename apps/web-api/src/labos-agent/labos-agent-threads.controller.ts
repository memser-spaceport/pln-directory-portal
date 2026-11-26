import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import {
  LabosAgentDraftConfirmRequestSchema,
  LabosAgentDraftConfirmResponse,
  LabosAgentThread,
  LabosAgentThreadDeleteResponse,
  LabosAgentThreadIdSchema,
  LabosAgentThreadListResponse,
  LabosAgentThreadsQuerySchema,
} from 'libs/contracts/src/schema/labos-agent';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { LabosAgentExceptionFilter } from './labos-agent-exception.filter';
import { LabosAgentThreadsService } from './labos-agent-threads.service';
import { validBody } from './labos-agent-validation';

/**
 * LAB-3457: the shared chat history (T1 list, T2 read, T3 soft delete) and C5, the send or cancel of a saved intro
 * draft. Same guard, gate and error bodies as C1. The history depends on the member, so it is never cached.
 */
@Controller('v1/labos-agent')
@UseFilters(LabosAgentExceptionFilter)
export class LabosAgentThreadsController {
  constructor(private readonly threads: LabosAgentThreadsService) {}

  @Get('threads')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async list(@Query() query: unknown, @Req() req: { userEmail?: string }): Promise<LabosAgentThreadListResponse> {
    return this.threads.list(req.userEmail ?? '', validBody(LabosAgentThreadsQuerySchema, query, 'Invalid query'));
  }

  @Get('threads/:threadId')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async get(@Param('threadId') threadId: string, @Req() req: { userEmail?: string }): Promise<LabosAgentThread> {
    return this.threads.get(req.userEmail ?? '', validBody(LabosAgentThreadIdSchema, threadId, 'Invalid thread id'));
  }

  @Delete('threads/:threadId')
  @UseGuards(UserTokenValidation)
  async remove(
    @Param('threadId') threadId: string,
    @Req() req: { userEmail?: string }
  ): Promise<LabosAgentThreadDeleteResponse> {
    return this.threads.remove(req.userEmail ?? '', validBody(LabosAgentThreadIdSchema, threadId, 'Invalid thread id'));
  }

  /** C5: the only route that sends an intro from a saved agent draft. */
  @Post('drafts/confirm')
  @UseGuards(UserTokenValidation)
  async confirmDraft(
    @Body() body: unknown,
    @Req() req: { userEmail?: string }
  ): Promise<LabosAgentDraftConfirmResponse> {
    return this.threads.confirmDraft(req.userEmail ?? '', validBody(LabosAgentDraftConfirmRequestSchema, body));
  }
}
