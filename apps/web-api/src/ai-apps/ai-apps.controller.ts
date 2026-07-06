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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { Response } from 'express';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RbacGuard } from '../rbac/rbac.guard';
import { RbacService } from '../rbac/rbac.service';
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { AiAppsService } from './ai-apps.service';
import { AiAppsConnectService } from './ai-apps-connect.service';
import { AiAppsStarterKitService } from './ai-apps-starter-kit.service';
import { AiAppTokenGuard } from './guards/ai-app-token.guard';
import { DeployAppDto } from './dto/deploy-app.dto';
import { StartConnectDto } from './dto/start-connect.dto';
import { PollConnectDto } from './dto/poll-connect.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { AI_APPS_MAX_ZIP_BYTES } from './ai-apps.constants';

const READ = { anyOf: [AI_APPS_PERMISSIONS.READ, AI_APPS_PERMISSIONS.WRITE] };
const WRITE = { anyOf: [AI_APPS_PERMISSIONS.WRITE] };

@ApiTags('AI Apps')
@Controller('v1/ai-apps')
export class AiAppsController {
  constructor(
    private readonly aiAppsService: AiAppsService,
    private readonly connectService: AiAppsConnectService,
    private readonly starterKitService: AiAppsStarterKitService,
    private readonly rbacService: RbacService
  ) {}

  /**
   * Start a connect session (called by the headless AI agent, no auth). Returns
   * the LabOS connect URL + confirmation code to show the member, and the
   * `pollToken` the agent uses to collect its deploy token once approved.
   */
  @NoCache()
  @Post('connect')
  @UsePipes(ZodValidationPipe)
  async startConnect(@Body() body: StartConnectDto) {
    return this.connectService.startSession(body.clientName);
  }

  /**
   * Poll a connect session (agent, authenticated by the `pollToken`). Returns
   * the issued deploy token once the member has approved. Declared before
   * `connect/:uid` so the literal path wins.
   */
  @NoCache()
  @Post('connect/poll')
  @UsePipes(ZodValidationPipe)
  async pollConnect(@Body() body: PollConnectDto) {
    return this.connectService.poll(body.pollToken);
  }

  /** Connect-session display info for the LabOS connect page (member JWT). */
  @NoCache()
  @Get('connect/:uid')
  @UseGuards(UserTokenCheckGuard)
  async getConnectSession(@Param('uid') uid: string) {
    return this.connectService.getSessionForDisplay(uid);
  }

  /**
   * Approve a connect session from the LabOS connect page. Requires a logged-in
   * member; the `ai_apps.write` check (and the success/denied audit) happens in
   * the service so both outcomes are recorded.
   */
  @NoCache()
  @Post('connect/:uid/approve')
  @UseGuards(UserTokenCheckGuard)
  async approveConnectSession(@Param('uid') uid: string, @Req() req: any) {
    const memberUid = await this.resolveMemberUid(req);
    return this.connectService.approve(uid, memberUid);
  }

  /** Dashboard list of all AI Apps with their deploy status. */
  @NoCache()
  @Get()
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(READ)
  async listApps() {
    return this.aiAppsService.listApps();
  }

  /**
   * Event log (audit feed): kit downloads + deploy attempts/outcomes, newest
   * first. Optionally scope to one app with `?appUid=`. Declared before `:uid`
   * so the literal path wins over the param route.
   */
  @NoCache()
  @Get('events')
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(READ)
  async listEvents(@Query('appUid') appUid?: string, @Query('limit') limit?: string) {
    return this.aiAppsService.listEvents(appUid, limit ? Number(limit) : undefined);
  }

  /** Single AI App detail. */
  @NoCache()
  @Get(':uid')
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(READ)
  async getApp(@Param('uid') uid: string) {
    return this.aiAppsService.getApp(uid);
  }

  /** Full event/status history for a single app, newest first. */
  @NoCache()
  @Get(':uid/events')
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(READ)
  async getAppEvents(@Param('uid') uid: string, @Query('limit') limit?: string) {
    await this.aiAppsService.getApp(uid); // 404 if the app doesn't exist
    return this.aiAppsService.listEvents(uid, limit ? Number(limit) : undefined);
  }

  /**
   * Submit free-text feedback on an app from its detail page. Any member with
   * AI Apps access may submit, more than once per app.
   */
  @NoCache()
  @Post(':uid/feedback')
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(READ)
  @UsePipes(ZodValidationPipe)
  async submitFeedback(@Param('uid') uid: string, @Body() body: SubmitFeedbackDto, @Req() req: any) {
    const memberUid = await this.resolveMemberUid(req);
    return this.aiAppsService.submitFeedback(memberUid, uid, body.text);
  }

  /**
   * All feedback for one app, newest first. Restricted to the app's creator and
   * directory admins (checked in the service).
   */
  @NoCache()
  @Get(':uid/feedback')
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(READ)
  async listFeedback(@Param('uid') uid: string, @Req() req: any) {
    const memberUid = await this.resolveMemberUid(req);
    return this.aiAppsService.listFeedback(memberUid, uid);
  }

  /**
   * Delete an app: tears it down on the sandbox runner, marks it `DELETED`, and
   * records the delete events. Requires `ai_apps.write`.
   */
  @NoCache()
  @Delete(':uid')
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(WRITE)
  async deleteApp(@Param('uid') uid: string, @Req() req: any) {
    const memberUid = await this.resolveMemberUid(req);
    return this.aiAppsService.deleteApp(memberUid, uid);
  }

  /** Download the starter kit ZIP. Carries no token — the agent obtains a deploy credential at deploy time via the LabOS connect flow. */
  @NoCache()
  @Get('starter-kit/download')
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(WRITE)
  async downloadStarterKit(@Req() req: any, @Res() res: Response) {
    const memberUid = await this.resolveMemberUid(req);
    const zip = this.starterKitService.buildZip();
    await this.aiAppsService.logKitDownloaded(memberUid);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="pln-ai-apps-starter-kit.zip"',
      'Content-Length': zip.length.toString(),
    });
    res.send(zip);
  }

  /**
   * Deploy endpoint called by the member's AI agent, authenticated by the deploy
   * token. Accepts multipart/form-data: the app ZIP in `file` plus the metadata
   * fields. The backend uploads the ZIP to S3 and proxies to the sandbox runner.
   */
  @NoCache()
  @Post('deploy')
  @UseGuards(AiAppTokenGuard)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AI_APPS_MAX_ZIP_BYTES } }))
  @UsePipes(ZodValidationPipe)
  async deploy(@Req() req: any, @Body() body: DeployAppDto, @UploadedFile() file: Express.Multer.File) {
    return this.aiAppsService.deploy(req.aiAppMemberUid, body, file);
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
    throw new ForbiddenException('Could not resolve member for AI Apps request');
  }
}
