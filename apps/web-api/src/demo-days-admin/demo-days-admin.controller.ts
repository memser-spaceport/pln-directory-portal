import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Put,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { DemoDaysAdminService } from './demo-days-admin.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { UpdateFundraisingTeamDto } from 'libs/contracts/src/schema';
import { MembersService } from '../members/members.service';
import { UploadsService } from '../uploads/uploads.service';
import { UploadKind, UploadScopeType } from '@prisma/client';
import { DemoDaysService } from '../demo-days/demo-days.service';

@ApiTags('Demo Days Admin')
@Controller('v1/admin/demo-days')
export class DemoDaysAdminController {
  constructor(
    private readonly demoDaysService: DemoDaysService,
    private readonly demoDaysAdminService: DemoDaysAdminService,
    private readonly memberService: MembersService,
    private readonly uploadsService: UploadsService
  ) {}

  @Get('current/fundraising-profiles')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getCurrentDemoDayFundraisingProfilesAdmin(
    @Req() req,
    @Query('stage') stage?: string[] | string,
    @Query('industry') industry?: string[] | string,
    @Query('search') search?: string
  ) {
    await this.checkAdminAccess(req.userEmail, true);

    const normalize = (v: string | string[] | undefined) => (!v ? undefined : Array.isArray(v) ? v : v.split(','));

    return this.demoDaysAdminService.getCurrentDemoDayFundraisingProfiles({
      stage: normalize(stage),
      industry: normalize(industry),
      search,
    });
  }

  @Put('current/teams/:teamUid/fundraising-profile/one-pager')
  @UseGuards(UserTokenValidation)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'onePagerFile', maxCount: 1 }]))
  @NoCache()
  async updateOnePagerByTeamUid(
    @Req() req,
    @Param('teamUid') teamUid: string,
    @UploadedFiles() files: { onePagerFile?: Express.Multer.File[] }
  ) {
    await this.checkAdminAccess(req.userEmail);

    if (!files.onePagerFile?.[0]) {
      throw new Error('onePagerFile is required');
    }

    const upload = await this.uploadsService.uploadGeneric({
      file: files.onePagerFile[0],
      kind: UploadKind.SLIDE,
      scopeType: UploadScopeType.NONE,
    });

    return this.demoDaysAdminService.updateFundraisingOnePager(teamUid, upload.uid);
  }

  @Delete('current/teams/:teamUid/fundraising-profile/one-pager')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteOnePagerByTeamUid(@Req() req, @Param('teamUid') teamUid: string) {
    await this.checkAdminAccess(req.userEmail);
    return this.demoDaysAdminService.deleteFundraisingOnePager(teamUid);
  }

  @Put('current/teams/:teamUid/fundraising-profile/description')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async updateDescriptionByTeamUid(
    @Req() req,
    @Param('teamUid') teamUid: string,
    @Body() body: { description: string }
  ) {
    await this.checkAdminAccess(req.userEmail);

    if (!body.description || body.description.trim() === '') {
      throw new Error('description is required');
    }

    return this.demoDaysAdminService.updateFundraisingDescription(teamUid, body.description);
  }

  @Put('current/teams/:teamUid/fundraising-profile/video')
  @UseGuards(UserTokenValidation)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'videoFile', maxCount: 1 }]))
  @NoCache()
  async updateVideoByTeamUid(
    @Req() req,
    @Param('teamUid') teamUid: string,
    @UploadedFiles() files: { videoFile?: Express.Multer.File[] }
  ) {
    await this.checkAdminAccess(req.userEmail);

    if (!files.videoFile?.[0]) {
      throw new Error('videoFile is required');
    }

    const upload = await this.uploadsService.uploadGeneric({
      file: files.videoFile[0],
      kind: UploadKind.VIDEO,
      scopeType: UploadScopeType.NONE,
    });

    return this.demoDaysAdminService.updateFundraisingVideo(teamUid, upload.uid);
  }

  @Delete('current/teams/:teamUid/fundraising-profile/video')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteVideoByTeamUid(@Req() req, @Param('teamUid') teamUid: string) {
    await this.checkAdminAccess(req.userEmail);
    return this.demoDaysAdminService.deleteFundraisingVideo(teamUid);
  }

  @Patch('current/teams/:teamUid/fundraising-profile')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateTeamByUid(@Req() req, @Param('teamUid') teamUid: string, @Body() body: UpdateFundraisingTeamDto) {
    await this.checkAdminAccess(req.userEmail);
    return this.demoDaysAdminService.updateFundraisingTeam(teamUid, body);
  }

  private async checkAdminAccess(userEmail: string, viewOnlyAccess = false) {
    const requestor = await this.memberService.findMemberByEmail(userEmail);

    if (!requestor) {
      throw new ForbiddenException(`Member with email ${userEmail} not found`);
    }

    const isDirectoryAdmin = this.memberService.checkIfAdminUser(requestor);

    if (!isDirectoryAdmin) {
      if (!viewOnlyAccess) {
        throw new ForbiddenException(`Member with email ${userEmail} isn't admin`);
      }

      const hasViewOnlyAdminAccess = await this.demoDaysAdminService.checkViewOnlyAccess(requestor.uid);
      if (!hasViewOnlyAdminAccess) {
        throw new ForbiddenException(`Member with email ${userEmail} isn't admin`);
      }
    }
  }
}
