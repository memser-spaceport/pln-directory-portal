import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { AiAppTokenGuard } from './guards/ai-app-token.guard';
import { AiAppsTestingUsersService } from './ai-apps-testing-users.service';
import {
  CreateAiAppTestingUsersDto,
  ListAiAppTestingUsersQueryDto,
  MintAiAppTestingSessionsDto,
} from './dto/testing-users.dto';

const READ = { anyOf: [AI_APPS_PERMISSIONS.READ, AI_APPS_PERMISSIONS.WRITE] };
const WRITE = { anyOf: [AI_APPS_PERMISSIONS.WRITE] };

/**
 * Preview testing users of one AI App (LAB-2743), under the AI Apps routes. Same guard set as the deploy-key
 * routes; the creator-or-directory-admin check is in the service. App session tokens never reach these routes
 * (`AiAppSessionScopeMiddleware` only lets them through to `/me`, `/track` and `/access-check`).
 */
@ApiTags('AI Apps')
@Controller('v1/ai-apps')
export class AiAppsTestingUsersController {
  constructor(
    private readonly testingUsersService: AiAppsTestingUsersService,
    private readonly rbacService: RbacService
  ) {}

  /** Every testing user of the app, active and revoked, oldest first, paged with `page` + `limit` (at most 100). */
  @NoCache()
  @Get(':uid/testing-users')
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(READ)
  @UsePipes(ZodValidationPipe)
  async listTestingUsers(@Param('uid') uid: string, @Query() query: ListAiAppTestingUsersQueryDto, @Req() req: any) {
    const memberUid = await this.resolveMemberUid(req);
    return this.testingUsersService.list(memberUid, uid, query as { page?: number; limit?: number });
  }

  /** Create `count` (1 to 100) testing users, all or nothing: 400 without a Preview or past 100 active users. */
  @NoCache()
  @Post(':uid/testing-users')
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(WRITE)
  @UsePipes(ZodValidationPipe)
  async createTestingUsers(@Param('uid') uid: string, @Body() body: CreateAiAppTestingUsersDto, @Req() req: any) {
    const memberUid = await this.resolveMemberUid(req);
    return this.testingUsersService.create(memberUid, uid, body.count);
  }

  /** Agent path for create: same body as the member route, deploy-token auth. */
  @NoCache()
  @Post(':uid/agent/testing-users')
  @UseGuards(AiAppTokenGuard)
  @UsePipes(ZodValidationPipe)
  async createTestingUsersFromAgent(
    @Param('uid') uid: string,
    @Body() body: CreateAiAppTestingUsersDto,
    @Req() req: any
  ) {
    return this.testingUsersService.create(this.agentMemberUid(req, uid), uid, body.count);
  }

  /** Mint one Preview session token per active testing user. Each token is returned once. */
  @NoCache()
  @Post(':uid/testing-users/sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(WRITE)
  @UsePipes(ZodValidationPipe)
  async mintTestingSessions(@Param('uid') uid: string, @Body() body: MintAiAppTestingSessionsDto, @Req() req: any) {
    const memberUid = await this.resolveMemberUid(req);
    return this.testingUsersService.mintSessions(memberUid, uid, body.uids);
  }

  /** Agent path for mint: same body as the member route, deploy-token auth. */
  @NoCache()
  @Post(':uid/agent/testing-users/sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AiAppTokenGuard)
  @UsePipes(ZodValidationPipe)
  async mintTestingSessionsFromAgent(
    @Param('uid') uid: string,
    @Body() body: MintAiAppTestingSessionsDto,
    @Req() req: any
  ) {
    return this.testingUsersService.mintSessions(this.agentMemberUid(req, uid), uid, body.uids);
  }

  /** Revoke one testing user (idempotent; the row is kept with `revokedAt`). */
  @NoCache()
  @Post(':uid/testing-users/:testingUserUid/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(WRITE)
  async revokeTestingUser(@Param('uid') uid: string, @Param('testingUserUid') testingUserUid: string, @Req() req: any) {
    const memberUid = await this.resolveMemberUid(req);
    return this.testingUsersService.revoke(memberUid, uid, testingUserUid);
  }

  /** Same resolution as `AiAppsController`: the guard's member uid, else the member behind the token's email. */
  private async resolveMemberUid(req: any): Promise<string> {
    const memberUid = req.memberUid ?? req.user?.memberUid;
    if (memberUid) {
      return memberUid;
    }
    const email = req.userEmail ?? req.user?.email;
    if (email) {
      const member = await this.rbacService.findMemberByEmail(email);
      if (member) {
        return member.uid;
      }
    }
    throw new ForbiddenException('Could not resolve member for AI Apps request');
  }

  /** Deploy-token member, plus the same app-scope check agent feedback uses. */
  private agentMemberUid(req: any, appUid: string): string {
    if (req.aiAppKeyScope?.appUid && req.aiAppKeyScope.appUid !== appUid) {
      throw new ForbiddenException('This deployment key cannot access that app');
    }
    const memberUid = req.aiAppMemberUid;
    if (!memberUid) {
      throw new ForbiddenException('Could not resolve member for AI Apps request');
    }
    return memberUid;
  }
}
