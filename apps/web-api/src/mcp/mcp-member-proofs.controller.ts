import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { Request } from 'express';
import { NoCache } from '../decorators/no-cache.decorator';
import { RequireIntegrationScopes } from '../decorators/require-integration-scopes.decorator';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import type { IntegrationKeyRequestContext } from '../integration-keys/integration-keys.service';
import { IssueMemberProofDto, RedeemMemberProofDto } from './dto/member-proof.dto';
import { McpMemberProofService } from './mcp-member-proof.service';

function mcpAccessToken(req: Request): string | undefined {
  const [type, token] = req.headers.authorization?.split(' ') ?? [];
  if (type === 'Bearer' && token) {
    return token;
  }
}

/**
 * Agent route. Authenticates the MCP access token itself, like `/v1/mcp/app-sessions`; a member LabOS token is not a
 * credential here.
 */
@ApiTags('MCP')
@Controller('v1/mcp')
export class McpMemberProofsController {
  constructor(private readonly proofs: McpMemberProofService) {}

  @NoCache()
  @Post('member-proofs')
  @UsePipes(ZodValidationPipe)
  async issue(@Body() body: IssueMemberProofDto, @Req() req: Request) {
    const token = mcpAccessToken(req);
    if (!token) {
      throw new UnauthorizedException('MCP OAuth token required');
    }
    return this.proofs.issue(token, body.audience);
  }
}

/**
 * The redeem side, for the server of a PL app outside LabOS, authenticated by its integration key. Exempt from the
 * member rate limiter like the other `/v1/integrations` routes.
 */
@ApiTags('Integrations')
@Controller('v1/integrations/member-proofs')
@UseGuards(IntegrationKeyGuard)
@RequireIntegrationScopes('members:sign-in')
@SkipThrottle()
@NoCache()
export class McpMemberProofsIntegrationController {
  constructor(private readonly proofs: McpMemberProofService) {}

  /** The member and agent behind a proof issued for this key. Consumes the proof. */
  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @UsePipes(ZodValidationPipe)
  async redeem(@Body() body: RedeemMemberProofDto, @Req() req: { integrationKey: IntegrationKeyRequestContext }) {
    return this.proofs.redeem(body.proof, req.integrationKey.uid);
  }
}
