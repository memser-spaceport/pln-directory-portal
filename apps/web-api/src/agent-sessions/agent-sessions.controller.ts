import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RbacGuard } from '../rbac/rbac.guard';
import { RbacService } from '../rbac/rbac.service';
import { CODE_AGENT_SESSIONS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { AgentSessionsService } from './agent-sessions.service';
import { CreateAgentSessionDto } from './dto/create-agent-session.dto';
import { SendAgentSessionMessageDto } from './dto/send-agent-session-message.dto';

const VIEW = { anyOf: [CODE_AGENT_SESSIONS_PERMISSIONS.VIEW, CODE_AGENT_SESSIONS_PERMISSIONS.ADMIN] };
const ADMIN = { anyOf: [CODE_AGENT_SESSIONS_PERMISSIONS.ADMIN] };

@ApiTags('Agent Sessions')
@Controller('v1/agent-sessions')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class AgentSessionsController {
  constructor(private readonly agentSessionsService: AgentSessionsService, private readonly rbacService: RbacService) {}

  @NoCache()
  @Get('repositories')
  @RequirePermissions(VIEW)
  async listRepositories() {
    return this.agentSessionsService.listRepositories();
  }

  @NoCache()
  @Get()
  @RequirePermissions(VIEW)
  async listSessions(@Query('limit') limit?: string, @Query('status') status?: string) {
    return this.agentSessionsService.listSessions({
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }

  @NoCache()
  @Get(':id/progress')
  @RequirePermissions(VIEW)
  async getProgress(@Param('id') id: string) {
    return this.agentSessionsService.getProgress(id);
  }

  @NoCache()
  @Get(':id/messages')
  @RequirePermissions(VIEW)
  async listMessages(@Param('id') id: string, @Query('afterId') afterId?: string, @Query('limit') limit?: string) {
    return this.agentSessionsService.listMessages(id, {
      afterId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ADMIN, not VIEW: posting a message starts a new agent execution against the
  // session's branch — the same weight class as the feature-env actions below.
  @NoCache()
  @Post(':id/messages')
  @RequirePermissions(ADMIN)
  @UsePipes(ZodValidationPipe)
  async createMessage(@Param('id') id: string, @Body() body: SendAgentSessionMessageDto) {
    return this.agentSessionsService.createMessage(id, body.message);
  }

  @NoCache()
  @Post(':id/feature-env')
  @RequirePermissions(ADMIN)
  async deployFeatureEnv(@Param('id') id: string, @Query('force') force?: string) {
    return this.agentSessionsService.deployFeatureEnv(id, force === 'true');
  }

  @NoCache()
  @Delete(':id/feature-env')
  @RequirePermissions(ADMIN)
  async deleteFeatureEnv(@Param('id') id: string, @Query('force') force?: string) {
    return this.agentSessionsService.deleteFeatureEnv(id, force === 'true');
  }

  @NoCache()
  @Get(':id')
  @RequirePermissions(VIEW)
  async getSession(@Param('id') id: string) {
    return this.agentSessionsService.getSession(id);
  }

  @NoCache()
  @Post()
  @RequirePermissions(ADMIN)
  @UsePipes(ZodValidationPipe)
  async createSession(@Body() body: CreateAgentSessionDto, @Req() req: any) {
    const requestedBy = await this.resolveRequestedBy(req);
    return this.agentSessionsService.createSession(body, requestedBy);
  }

  private async resolveRequestedBy(req: any): Promise<string> {
    const memberUid = req.memberUid ?? req.user?.memberUid;
    if (memberUid) {
      const member = await this.rbacService.findMemberByUid(memberUid);
      if (member?.name) return member.name;
      if (member?.email) return member.email;
      return memberUid;
    }

    const email = req.userEmail ?? req.user?.email;
    if (email) {
      const member = await this.rbacService.findMemberByEmail(email);
      if (member?.name) return member.name;
      return email;
    }

    throw new ForbiddenException('Could not resolve member for Agent Sessions request');
  }
}
