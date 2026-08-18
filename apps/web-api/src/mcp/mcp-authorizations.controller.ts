import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { RbacService } from '../rbac/rbac.service';
import { ApproveMcpOAuthDto } from './dto/approve-mcp-oauth.dto';
import { McpOAuthService } from './mcp-oauth.service';

const CONNECT = { anyOf: [RBAC_PERMISSION_CODES.MCP_CONNECT] };

@ApiTags('MCP')
@Controller('v1/mcp')
@UseGuards(UserAccessTokenValidateGuard, RbacGuard)
@RequirePermissions(CONNECT)
export class McpAuthorizationsController {
  constructor(private readonly oauth: McpOAuthService, private readonly rbacService: RbacService) {}

  @NoCache()
  @Post('oauth/approve')
  @UsePipes(ZodValidationPipe)
  async approve(@Body() body: ApproveMcpOAuthDto, @Req() req: any) {
    const memberUid = await this.resolveMemberUid(req);
    return this.oauth.approve(memberUid, body);
  }

  @NoCache()
  @Get('authorizations')
  async list(@Req() req: any) {
    const memberUid = await this.resolveMemberUid(req);
    return this.oauth.listAuthorizations(memberUid);
  }

  @NoCache()
  @Delete('authorizations/:uid')
  async revoke(@Param('uid') uid: string, @Req() req: any) {
    const memberUid = await this.resolveMemberUid(req);
    return this.oauth.revokeAuthorizationForMember(memberUid, uid);
  }

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
    throw new ForbiddenException('Could not resolve member for MCP request');
  }
}
