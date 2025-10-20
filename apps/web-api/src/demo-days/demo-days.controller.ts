import {
  Body,
  Controller,
  Delete,
  Get,
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

  @Get('current')
  @UseGuards(UserTokenCheckGuard)
  @NoCache()
  async getCurrentDemoDay(@Req() req) {
    return this.demoDaysService.getCurrentDemoDayAccess(req.userEmail || null);
  }

  // Fundraising endpoints

  @Get('current/fundraising-profile')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getCurrentDemoDayFundraisingProfile(@Req() req) {
    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfile(req.userEmail);
  }

  @Get('current/fundraising-profiles')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getCurrentDemoDayFundraisingProfiles(
    @Req() req,
    @Query('stage') stage?: string[] | string,
    @Query('industry') industry?: string[] | string,
    @Query('search') search?: string
  ) {
    const normalize = (v: string | string[] | undefined) => (!v ? undefined : Array.isArray(v) ? v : v.split(','));

    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfiles(req.userEmail, {
      stage: normalize(stage),
      industry: normalize(industry),
      search,
    });
  }

  @Put('current/fundraising-profile/one-pager')
  @UseGuards(UserTokenValidation)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'onePagerFile', maxCount: 1 }]))
  @NoCache()
  async updateOnePager(@Req() req, @UploadedFiles() files: { onePagerFile?: Express.Multer.File[] }) {
    if (!files.onePagerFile?.[0]) {
      throw new Error('onePagerFile is required');
    }

    const upload = await this.uploadsService.uploadGeneric({
      file: files.onePagerFile[0],
      kind: UploadKind.SLIDE,
      scopeType: UploadScopeType.NONE,
    });

    return this.demoDayFundraisingProfilesService.updateFundraisingOnePager(req.userEmail, upload.uid);
  }

  @Delete('current/fundraising-profile/one-pager')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteOnePager(@Req() req) {
    return this.demoDayFundraisingProfilesService.deleteFundraisingOnePager(req.userEmail);
  }

  @Put('current/fundraising-profile/video')
  @UseGuards(UserTokenValidation)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'videoFile', maxCount: 1 }]))
  @NoCache()
  async updateVideo(@Req() req, @UploadedFiles() files: { videoFile?: Express.Multer.File[] }) {
    if (!files.videoFile?.[0]) {
      throw new Error('videoFile is required');
    }

    const upload = await this.uploadsService.uploadGeneric({
      file: files.videoFile[0],
      kind: UploadKind.VIDEO,
      scopeType: UploadScopeType.NONE,
    });

    return this.demoDayFundraisingProfilesService.updateFundraisingVideo(req.userEmail, upload.uid);
  }

  @Put('current/fundraising-profile/description')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async updateDescription(@Req() req, @Body() body: UpdateFundraisingDescriptionDto) {
    if (!body.description || body.description.trim() === '') {
      throw new Error('description is required');
    }

    return this.demoDayFundraisingProfilesService.updateFundraisingDescription(req.userEmail, body.description);
  }

  @Delete('current/fundraising-profile/video')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteVideo(@Req() req) {
    return this.demoDayFundraisingProfilesService.deleteFundraisingVideo(req.userEmail);
  }

  @Patch('current/fundraising-profile/team')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateTeam(@Req() req, @Body() body: UpdateFundraisingTeamDto) {
    return this.demoDayFundraisingProfilesService.updateFundraisingTeam(req.userEmail, body);
  }

  // Engagement endpoints

  @Get('current/engagement')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getCurrentEngagement(@Req() req) {
    // Returns minimal engagement state for the UI
    return this.demoDayEngagementService.getCurrentEngagement(req.userEmail);
  }

  @Post('current/engagement/calendar-added')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async markCalendarAdded(@Req() req) {
    // Tracks the "Add to Calendar" click (.ics button)
    return this.demoDayEngagementService.markCalendarAdded(req.userEmail);
  }

  @Post('current/express-interest')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async expressInterest(@Req() req, @Body() body: ExpressInterestDto) {
    return this.demoDayEngagementService.expressInterest(
      req.userEmail,
      body.teamFundraisingProfileUid,
      body.interestType,
      body.isPrepDemoDay,
      body.referralData
    );
  }

  @NoCache() //turn off global cache
  @Get('current/express-interest/stats')
  async getExpressInterestStats(@Query('prep') prep?: string) {
    const isPrepDemoDay = (prep ?? '').toString().toLowerCase() === 'true';
    const key = `express-interest:${isPrepDemoDay}`;
    const now = Date.now();

    const cached = cache.get(key);
    if (cached && cached.expires > now) return cached.data; // cache hit
    const data = await this.demoDaysService.getCurrentExpressInterestStats(isPrepDemoDay);
    cache.set(key, { data, expires: now + TTL });
    return data;
  }

  // Direct S3 upload endpoints
  @Post('current/fundraising-profile/video/upload-url')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getVideoUploadUrl(@Req() req, @Body() body: { filename: string; filesize: number; mimetype: string }) {
    if (!body.filename || !body.filesize || !body.mimetype) {
      throw new Error('filename, filesize, and mimetype are required');
    }

    return this.demoDayFundraisingProfilesService.generateVideoUploadUrl(
      req.userEmail,
      body.filename,
      body.filesize,
      body.mimetype
    );
  }

  @Post('current/fundraising-profile/video/confirm')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async confirmVideoUpload(@Req() req, @Body() body: { uploadUid: string }) {
    if (!body.uploadUid) {
      throw new Error('uploadUid is required');
    }

    return this.demoDayFundraisingProfilesService.confirmVideoUpload(req.userEmail, body.uploadUid);
  }

  @Post('current/fundraising-profile/one-pager/upload-url')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getOnePagerUploadUrl(@Req() req, @Body() body: { filename: string; filesize: number; mimetype: string }) {
    if (!body.filename || !body.filesize || !body.mimetype) {
      throw new Error('filename, filesize, and mimetype are required');
    }

    return this.demoDayFundraisingProfilesService.generateOnePagerUploadUrl(
      req.userEmail,
      body.filename,
      body.filesize,
      body.mimetype
    );
  }

  @Post('current/fundraising-profile/one-pager/confirm')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async confirmOnePagerUpload(@Req() req, @Body() body: { uploadUid: string }) {
    if (!body.uploadUid) {
      throw new Error('uploadUid is required');
    }

    return this.demoDayFundraisingProfilesService.confirmOnePagerUpload(req.userEmail, body.uploadUid);
  }

  @Post('current/fundraising-profile/one-pager/preview')
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
    @Req() req,
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
      files.previewImage[0],
      files.previewImageSmall?.[0]
    );
  }
}
