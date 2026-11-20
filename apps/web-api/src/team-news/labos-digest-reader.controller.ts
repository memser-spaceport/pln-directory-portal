import { Body, Controller, ForbiddenException, HttpCode, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiNotFoundResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Request } from 'express';
import {
  LabosDigestChoiceResponseSchema,
  LabosDigestIssueChoiceRequestSchema,
  LabosDigestIssuePageRequestSchema,
  LabosDigestPageSchema,
} from 'libs/contracts/src/schema/team-news';
import { FORUM_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NoCache } from '../decorators/no-cache.decorator';
import { OptionalUserTokenCheckGuard } from '../guards/user-token-check.guard';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { MembersService } from '../members/members.service';
import { DigestViewer, LabosDigestPageService } from './labos-digest-page.service';
import { parseInput } from './labos-digest-public.controller';

type SignedRequest = Request & { userEmail?: string };

/**
 * The digest page by issue id (LAB-3356). No link token: the session is the only thing that names a reader. The
 * read works signed out (no member data); More / Less need sign-in and save for the signed-in member only. Guards
 * are per route, so the token routes of `LabosDigestPublicController` stay guard-free.
 */
@ApiTags('LabOS Digest - Page')
@Controller('v1/labos-digest')
export class LabosDigestReaderController {
  private readonly logger = new Logger(LabosDigestReaderController.name);

  constructor(
    private readonly page: LabosDigestPageService,
    private readonly members: MembersService,
    private readonly accessControl: AccessControlV2Service
  ) {}

  @Post('issue-page')
  @HttpCode(200)
  @NoCache()
  @UseGuards(OptionalUserTokenCheckGuard)
  @ApiOkResponseFromZod(LabosDigestPageSchema)
  @ApiNotFoundResponse({ description: 'No issue has this id.' })
  async readIssue(@Req() req: SignedRequest, @Body() body: unknown) {
    const { issueUid } = parseInput(LabosDigestIssuePageRequestSchema, body);
    return this.page.readIssueByUid(issueUid, await this.viewerOf(req.userEmail));
  }

  @Post('issue-choices')
  @HttpCode(200)
  @NoCache()
  @UseGuards(UserTokenValidation)
  @ApiOkResponseFromZod(LabosDigestChoiceResponseSchema)
  @ApiUnauthorizedResponse({ description: 'Not signed in.' })
  @ApiForbiddenResponse({ description: 'Signed in, but not a member.' })
  @ApiNotFoundResponse({ description: 'No issue has this id.' })
  async chooseOnIssue(@Req() req: SignedRequest, @Body() body: unknown) {
    const { issueUid, newsItemUid, choice } = parseInput(LabosDigestIssueChoiceRequestSchema, body);
    const member = req.userEmail ? await this.members.findMemberByEmail(req.userEmail) : null;
    if (!member) throw new ForbiddenException('Member not found');
    return this.page.chooseByIssue(issueUid, member.uid, newsItemUid, choice);
  }

  /** The signed-in member, or null signed out. A session that is not a member reads as signed out. */
  private async viewerOf(email: string | undefined): Promise<DigestViewer> {
    if (!email) return null;
    const member = await this.members.findMemberByEmail(email);
    if (!member) return null;
    const canReadForum = await this.accessControl
      .hasPermissionByEmail(email, FORUM_PERMISSIONS.READ)
      .then((result) => result.allowed)
      .catch((error) => {
        this.logger.warn(`Digest page forum access check failed: ${error instanceof Error ? error.message : error}`);
        return false;
      });
    return { uid: member.uid, canReadForum };
  }
}
