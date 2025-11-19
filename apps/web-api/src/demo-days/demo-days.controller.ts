import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { DemoDaysService } from './demo-days.service';
import { DemoDayFundraisingProfilesService } from './demo-day-fundraising-profiles.service';
import { DemoDayEngagementService } from './demo-day-engagement.service';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { UploadsService } from '../uploads/uploads.service';
import { UploadKind, UploadScopeType } from '@prisma/client';
import { NoCache } from '../decorators/no-cache.decorator';
import {
  CreateDemoDayFeedbackDto,
  CreateDemoDayInvestorApplicationDto,
  ExpressInterestDto,
  UpdateFundraisingDescriptionDto,
  UpdateFundraisingTeamDto,
} from 'libs/contracts/src/schema';

const cache = new Map<string, { data: any; expires: number }>();
const TTL = 30_000; // 30 seconds

@ApiTags('Demo Days')
@Controller('v1/demo-days')
export class DemoDaysController {
  constructor(
    private readonly demoDaysService: DemoDaysService,
    private readonly demoDayFundraisingProfilesService: DemoDayFundraisingProfilesService,
    private readonly uploadsService: UploadsService,
    private readonly demoDayEngagementService: DemoDayEngagementService
  ) {}

  @Get()
  @NoCache()
  async getAllDemoDays() {
    return this.demoDaysService.getAllDemoDays(true);
  }

  @Get(':demoDayUid')
  @UseGuards(UserTokenCheckGuard)
  @NoCache()
  async getCurrentDemoDay(@Param('demoDayUid') demoDayUid: string, @Req() req) {
    return this.demoDaysService.getDemoDayAccess(req.userEmail || null, demoDayUid);
  }

  // Fundraising endpoints

  @Get(':demoDayUid/fundraising-profile')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getCurrentDemoDayFundraisingProfile(@Param('demoDayUid') demoDayUid: string, @Req() req) {
    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfile(req.userEmail, demoDayUid);
  }

  @Get(':demoDayUid/fundraising-profiles')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getCurrentDemoDayFundraisingProfiles(
    @Param('demoDayUid') demoDayUid: string,
    @Req() req,
    @Query('stage') stage?: string[] | string,
    @Query('industry') industry?: string[] | string,
    @Query('search') search?: string,
    @Query('showDraft') showDraft?: string
  ) {
    const normalize = (v: string | string[] | undefined) => (!v ? undefined : Array.isArray(v) ? v : v.split(','));

    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfiles(
      req.userEmail,
      demoDayUid,
      {
        stage: normalize(stage),
        industry: normalize(industry),
        search,
      },
      showDraft === 'true'
    );
  }

  @Put(':demoDayUid/teams/:teamUid/fundraising-profile/one-pager')
  @UseGuards(UserTokenValidation)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'onePagerFile', maxCount: 1 }]))
  @NoCache()
  async updateOnePagerByTeam(
    @Param('demoDayUid') demoDayUid: string,
    @Req() req,
    @Param('teamUid') teamUid: string,
    @UploadedFiles() files: { onePagerFile?: Express.Multer.File[] }
  ) {
    if (!files.onePagerFile?.[0]) {
      throw new Error('onePagerFile is required');
    }

    const upload = await this.uploadsService.uploadGeneric({
      file: files.onePagerFile[0],
      kind: UploadKind.SLIDE,
      scopeType: UploadScopeType.NONE,
    });

    return this.demoDayFundraisingProfilesService.updateFundraisingOnePager(
      req.userEmail,
      teamUid,
      upload.uid,
      demoDayUid
    );
  }

  @Delete(':demoDayUid/teams/:teamUid/fundraising-profile/one-pager')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteOnePagerByTeam(@Param('demoDayUid') demoDayUid: string, @Req() req, @Param('teamUid') teamUid: string) {
    return this.demoDayFundraisingProfilesService.deleteFundraisingOnePager(req.userEmail, teamUid, demoDayUid);
  }

  @Put(':demoDayUid/teams/:teamUid/fundraising-profile/video')
  @UseGuards(UserTokenValidation)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'videoFile', maxCount: 1 }]))
  @NoCache()
  async updateVideoByTeam(
    @Param('demoDayUid') demoDayUid: string,
    @Req() req,
    @Param('teamUid') teamUid: string,
    @UploadedFiles() files: { videoFile?: Express.Multer.File[] }
  ) {
    if (!files.videoFile?.[0]) {
      throw new Error('videoFile is required');
    }

    const upload = await this.uploadsService.uploadGeneric({
      file: files.videoFile[0],
      kind: UploadKind.VIDEO,
      scopeType: UploadScopeType.NONE,
    });

    return this.demoDayFundraisingProfilesService.updateFundraisingVideo(
      req.userEmail,
      teamUid,
      upload.uid,
      demoDayUid
    );
  }

  @Put(':demoDayUid/teams/:teamUid/fundraising-profile/description')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async updateDescriptionByTeam(
    @Param('demoDayUid') demoDayUid: string,
    @Req() req,
    @Param('teamUid') teamUid: string,
    @Body() body: UpdateFundraisingDescriptionDto
  ) {
    if (!body.description || body.description.trim() === '') {
      throw new Error('description is required');
    }

    return this.demoDayFundraisingProfilesService.updateFundraisingDescription(
      req.userEmail,
      teamUid,
      body.description,
      demoDayUid
    );
  }

  @Delete(':demoDayUid/teams/:teamUid/fundraising-profile/video')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteVideoByTeam(@Param('demoDayUid') demoDayUid: string, @Req() req, @Param('teamUid') teamUid: string) {
    return this.demoDayFundraisingProfilesService.deleteFundraisingVideo(req.userEmail, teamUid, demoDayUid);
  }

  @Patch(':demoDayUid/teams/:teamUid/fundraising-profile/team')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateTeamByTeam(
    @Param('demoDayUid') demoDayUid: string,
    @Req() req,
    @Param('teamUid') teamUid: string,
    @Body() body: UpdateFundraisingTeamDto
  ) {
    return this.demoDayFundraisingProfilesService.updateFundraisingTeam(req.userEmail, teamUid, body, demoDayUid);
  }

  @Patch(':demoDayUid/confidentiality-policy')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async updateConfidentialityAcceptance(
    @Param('demoDayUid') demoDayUid: string,
    @Req() req,
    @Body() body: { accepted: boolean }
  ) {
    if (typeof body.accepted !== 'boolean') {
      throw new Error('accepted must be a boolean');
    }

    return this.demoDaysService.updateConfidentialityAcceptance(req.userEmail, body.accepted, demoDayUid);
  }

  // Engagement endpoints

  @Get(':demoDayUid/engagement')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getCurrentEngagement(@Param('demoDayUid') demoDayUid: string, @Req() req) {
    // Returns minimal engagement state for the UI
    return this.demoDayEngagementService.getCurrentEngagement(req.userEmail, demoDayUid);
  }

  @Post(':demoDayUid/engagement/calendar-added')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async markCalendarAdded(@Param('demoDayUid') demoDayUid: string, @Req() req) {
    // Tracks the "Add to Calendar" click (.ics button)
    return this.demoDayEngagementService.markCalendarAdded(req.userEmail, demoDayUid);
  }

  @Post(':demoDayUid/express-interest')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async expressInterest(@Param('demoDayUid') demoDayUid: string, @Req() req, @Body() body: ExpressInterestDto) {
    return this.demoDayEngagementService.expressInterest(
      req.userEmail,
      demoDayUid,
      body.teamFundraisingProfileUid,
      body.interestType,
      body.isPrepDemoDay,
      body.referralData
    );
  }

  @NoCache() //turn off global cache
  @Get(':demoDayUid/express-interest/stats')
  async getExpressInterestStats(@Param('demoDayUid') demoDayUid: string, @Query('prep') prep?: string) {
    const isPrepDemoDay = (prep ?? '').toString().toLowerCase() === 'true';
    const key = `express-interest:${demoDayUid}:${isPrepDemoDay}`;
    const now = Date.now();

    const cached = cache.get(key);
    if (cached && cached.expires > now) return cached.data; // cache hit
    const data = await this.demoDaysService.getCurrentExpressInterestStats(isPrepDemoDay, demoDayUid);
    cache.set(key, { data, expires: now + TTL });
    return data;
  }

  // Direct S3 upload endpoints
  @Post(':demoDayUid/teams/:teamUid/fundraising-profile/video/upload-url')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getVideoUploadUrl(
    @Param('demoDayUid') demoDayUid: string,
    @Req() req,
    @Param('teamUid') teamUid: string,
    @Body() body: { filename: string; filesize: number; mimetype: string }
  ) {
    if (!body.filename || !body.filesize || !body.mimetype) {
      throw new Error('filename, filesize, and mimetype are required');
    }

    return this.demoDayFundraisingProfilesService.generateVideoUploadUrl(
      req.userEmail,
      teamUid,
      body.filename,
      body.filesize,
      body.mimetype,
      demoDayUid
    );
  }

  @Post(':demoDayUid/teams/:teamUid/fundraising-profile/video/confirm')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async confirmVideoUpload(
    @Param('demoDayUid') demoDayUid: string,
    @Req() req,
    @Param('teamUid') teamUid: string,
    @Body() body: { uploadUid: string }
  ) {
    if (!body.uploadUid) {
      throw new Error('uploadUid is required');
    }

    return this.demoDayFundraisingProfilesService.confirmVideoUpload(
      req.userEmail,
      teamUid,
      body.uploadUid,
      demoDayUid
    );
  }

  @Post(':demoDayUid/teams/:teamUid/fundraising-profile/one-pager/upload-url')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getOnePagerUploadUrl(
    @Param('demoDayUid') demoDayUid: string,
    @Req() req,
    @Param('teamUid') teamUid: string,
    @Body() body: { filename: string; filesize: number; mimetype: string }
  ) {
    if (!body.filename || !body.filesize || !body.mimetype) {
      throw new Error('filename, filesize, and mimetype are required');
    }

    return this.demoDayFundraisingProfilesService.generateOnePagerUploadUrl(
      req.userEmail,
      teamUid,
      body.filename,
      body.filesize,
      body.mimetype,
      demoDayUid
    );
  }

  @Post(':demoDayUid/teams/:teamUid/fundraising-profile/one-pager/confirm')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async confirmOnePagerUpload(
    @Param('demoDayUid') demoDayUid: string,
    @Req() req,
    @Param('teamUid') teamUid: string,
    @Body() body: { uploadUid: string }
  ) {
    if (!body.uploadUid) {
      throw new Error('uploadUid is required');
    }

    return this.demoDayFundraisingProfilesService.confirmOnePagerUpload(
      req.userEmail,
      teamUid,
      body.uploadUid,
      demoDayUid
    );
  }

  @Post(':demoDayUid/teams/:teamUid/fundraising-profile/one-pager/preview')
  @UseGuards(UserTokenValidation)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        previewImage: { type: 'string', format: 'binary' },
        previewImageSmall: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'previewImage', maxCount: 1 },
      { name: 'previewImageSmall', maxCount: 1 },
    ])
  )
  @NoCache()
  async uploadOnePagerPreview(
    @Param('demoDayUid') demoDayUid: string,
    @Req() req,
    @Param('teamUid') teamUid: string,
    @UploadedFiles()
    files: {
      previewImage?: Express.Multer.File[];
      previewImageSmall?: Express.Multer.File[];
    }
  ) {
    if (!files.previewImage?.[0]) {
      throw new Error('previewImage is required');
    }

    return this.demoDayFundraisingProfilesService.uploadOnePagerPreviewByMember(
      req.userEmail,
      teamUid,
      files.previewImage[0],
      files.previewImageSmall?.[0],
      demoDayUid
    );
  }

  @Get(':demoDayUid/teams/:teamUid/analytics')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getTeamAnalytics(@Param('demoDayUid') demoDayUid: string, @Req() req, @Param('teamUid') teamUid: string) {
    return this.demoDaysService.getTeamAnalytics(teamUid, demoDayUid);
  }

  @Post(':demoDayUid/feedback')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async submitFeedback(@Param('demoDayUid') demoDayUid: string, @Req() req, @Body() body: CreateDemoDayFeedbackDto) {
    return this.demoDaysService.createFeedback(req.userEmail, body, demoDayUid);
  }

  @Post(':demoDayUid/investor-application')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async submitInvestorApplication(
    @Param('demoDayUid') demoDayUid: string,
    @Body() body: CreateDemoDayInvestorApplicationDto
  ) {
    return this.demoDaysService.submitInvestorApplication(body, demoDayUid);
  }
}
