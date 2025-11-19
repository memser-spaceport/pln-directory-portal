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

  @Get(':demoDayUidOrSlug')
  @UseGuards(UserTokenCheckGuard)
  @NoCache()
  async getCurrentDemoDay(@Param('demoDayUidOrSlug') demoDayUidOrSlug: string, @Req() req) {
    return this.demoDaysService.getDemoDayAccess(req.userEmail || null, demoDayUidOrSlug);
  }

  // Fundraising endpoints

  @Get(':demoDayUidOrSlug/fundraising-profile')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getCurrentDemoDayFundraisingProfile(@Param('demoDayUidOrSlug') demoDayUidOrSlug: string, @Req() req) {
    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfile(req.userEmail, demoDayUidOrSlug);
  }

  @Get(':demoDayUidOrSlug/fundraising-profiles')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getCurrentDemoDayFundraisingProfiles(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
    @Req() req,
    @Query('stage') stage?: string[] | string,
    @Query('industry') industry?: string[] | string,
    @Query('search') search?: string,
    @Query('showDraft') showDraft?: string
  ) {
    const normalize = (v: string | string[] | undefined) => (!v ? undefined : Array.isArray(v) ? v : v.split(','));

    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfiles(
      req.userEmail,
      demoDayUidOrSlug,
      {
        stage: normalize(stage),
        industry: normalize(industry),
        search,
      },
      showDraft === 'true'
    );
  }

  @Put(':demoDayUidOrSlug/teams/:teamUid/fundraising-profile/one-pager')
  @UseGuards(UserTokenValidation)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'onePagerFile', maxCount: 1 }]))
  @NoCache()
  async updateOnePagerByTeam(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
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
      demoDayUidOrSlug
    );
  }

  @Delete(':demoDayUidOrSlug/teams/:teamUid/fundraising-profile/one-pager')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteOnePagerByTeam(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
    @Req() req,
    @Param('teamUid') teamUid: string
  ) {
    return this.demoDayFundraisingProfilesService.deleteFundraisingOnePager(req.userEmail, teamUid, demoDayUidOrSlug);
  }

  @Put(':demoDayUidOrSlug/teams/:teamUid/fundraising-profile/video')
  @UseGuards(UserTokenValidation)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'videoFile', maxCount: 1 }]))
  @NoCache()
  async updateVideoByTeam(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
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
      demoDayUidOrSlug
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

  @Delete(':demoDayUidOrSlug/teams/:teamUid/fundraising-profile/video')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteVideoByTeam(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
    @Req() req,
    @Param('teamUid') teamUid: string
  ) {
    return this.demoDayFundraisingProfilesService.deleteFundraisingVideo(req.userEmail, teamUid, demoDayUidOrSlug);
  }

  @Patch(':demoDayUidOrSlug/teams/:teamUid/fundraising-profile/team')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateTeamByTeam(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
    @Req() req,
    @Param('teamUid') teamUid: string,
    @Body() body: UpdateFundraisingTeamDto
  ) {
    return this.demoDayFundraisingProfilesService.updateFundraisingTeam(req.userEmail, teamUid, body, demoDayUidOrSlug);
  }

  @Patch(':demoDayUidOrSlug/confidentiality-policy')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async updateConfidentialityAcceptance(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
    @Req() req,
    @Body() body: { accepted: boolean }
  ) {
    if (typeof body.accepted !== 'boolean') {
      throw new Error('accepted must be a boolean');
    }

    return this.demoDaysService.updateConfidentialityAcceptance(req.userEmail, body.accepted, demoDayUidOrSlug);
  }

  // Engagement endpoints

  @Get(':demoDayUidOrSlug/engagement')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getCurrentEngagement(@Param('demoDayUidOrSlug') demoDayUidOrSlug: string, @Req() req) {
    // Returns minimal engagement state for the UI
    return this.demoDayEngagementService.getCurrentEngagement(req.userEmail, demoDayUidOrSlug);
  }

  @Post(':demoDayUidOrSlug/engagement/calendar-added')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async markCalendarAdded(@Param('demoDayUidOrSlug') demoDayUidOrSlug: string, @Req() req) {
    // Tracks the "Add to Calendar" click (.ics button)
    return this.demoDayEngagementService.markCalendarAdded(req.userEmail, demoDayUidOrSlug);
  }

  @Post(':demoDayUidOrSlug/express-interest')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async expressInterest(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
    @Req() req,
    @Body() body: ExpressInterestDto
  ) {
    return this.demoDayEngagementService.expressInterest(
      req.userEmail,
      demoDayUidOrSlug,
      body.teamFundraisingProfileUid,
      body.interestType,
      body.isPrepDemoDay,
      body.referralData
    );
  }

  @NoCache() //turn off global cache
  @Get(':demoDayUidOrSlug/express-interest/stats')
  async getExpressInterestStats(@Param('demoDayUidOrSlug') demoDayUidOrSlug: string, @Query('prep') prep?: string) {
    const isPrepDemoDay = (prep ?? '').toString().toLowerCase() === 'true';
    const key = `express-interest:${demoDayUidOrSlug}:${isPrepDemoDay}`;
    const now = Date.now();

    const cached = cache.get(key);
    if (cached && cached.expires > now) return cached.data; // cache hit
    const data = await this.demoDaysService.getCurrentExpressInterestStats(isPrepDemoDay, demoDayUidOrSlug);
    cache.set(key, { data, expires: now + TTL });
    return data;
  }

  // Direct S3 upload endpoints
  @Post(':demoDayUidOrSlug/teams/:teamUid/fundraising-profile/video/upload-url')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getVideoUploadUrl(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
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
      demoDayUidOrSlug
    );
  }

  @Post(':demoDayUidOrSlug/teams/:teamUid/fundraising-profile/video/confirm')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async confirmVideoUpload(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
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
      demoDayUidOrSlug
    );
  }

  @Post(':demoDayUidOrSlug/teams/:teamUid/fundraising-profile/one-pager/upload-url')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getOnePagerUploadUrl(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
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
      demoDayUidOrSlug
    );
  }

  @Post(':demoDayUidOrSlug/teams/:teamUid/fundraising-profile/one-pager/confirm')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async confirmOnePagerUpload(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
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
      demoDayUidOrSlug
    );
  }

  @Post(':demoDayUidOrSlug/teams/:teamUid/fundraising-profile/one-pager/preview')
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
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
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
      demoDayUidOrSlug
    );
  }

  @Get(':demoDayUidOrSlug/teams/:teamUid/analytics')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getTeamAnalytics(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
    @Req() req,
    @Param('teamUid') teamUid: string
  ) {
    return this.demoDaysService.getTeamAnalytics(teamUid, demoDayUidOrSlug);
  }

  @Post(':demoDayUidOrSlug/feedback')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async submitFeedback(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
    @Req() req,
    @Body() body: CreateDemoDayFeedbackDto
  ) {
    return this.demoDaysService.createFeedback(req.userEmail, body, demoDayUidOrSlug);
  }

  @Post(':demoDayUidOrSlug/investor-application')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async submitInvestorApplication(
    @Param('demoDayUidOrSlug') demoDayUidOrSlug: string,
    @Body() body: CreateDemoDayInvestorApplicationDto
  ) {
    return this.demoDaysService.submitInvestorApplication(body, demoDayUidOrSlug);
  }
}
