import {
  Controller,
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
import { AiAppsStarterKitService } from './ai-apps-starter-kit.service';
import { AiAppTokenGuard } from './guards/ai-app-token.guard';
import { DeployAppDto } from './dto/deploy-app.dto';
import { AI_APPS_MAX_ZIP_BYTES } from './ai-apps.constants';

const READ = { anyOf: [AI_APPS_PERMISSIONS.READ, AI_APPS_PERMISSIONS.WRITE] };
const WRITE = { anyOf: [AI_APPS_PERMISSIONS.WRITE] };

@ApiTags('AI Apps')
@Controller('v1/ai-apps')
export class AiAppsController {
  constructor(
    private readonly aiAppsService: AiAppsService,
    private readonly starterKitService: AiAppsStarterKitService,
    private readonly rbacService: RbacService
  ) {}

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

  /** Download the reusable starter kit ZIP (creates the member's token on first use). */
  @NoCache()
  @Get('starter-kit/download')
  @UseGuards(UserTokenCheckGuard, RbacGuard)
  @RequirePermissions(WRITE)
  async downloadStarterKit(@Req() req: any, @Res() res: Response) {
    const memberUid = await this.resolveMemberUid(req);
    const token = await this.aiAppsService.ensureToken(memberUid);
    const zip = this.starterKitService.buildZip(token);
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
