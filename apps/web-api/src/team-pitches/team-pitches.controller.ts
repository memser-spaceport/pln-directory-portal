import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { TeamPitchesService } from './team-pitches.service';
import { TeamPitchProfilesService } from './team-pitch-profiles.service';
import { TeamPitchEngagementService } from './team-pitch-engagement.service';
import {
  TeamPitchConfidentialityDto,
  TeamPitchExpressInterestDto,
  UpdateTeamPitchProfileDto,
  UpdateTeamPitchTeamDto,
} from 'libs/contracts/src/schema/team-pitch';

@ApiTags('Team Pitches')
@Controller('v1/team-pitches')
export class TeamPitchesController {
  constructor(
    private readonly teamPitchesService: TeamPitchesService,
    private readonly teamPitchProfilesService: TeamPitchProfilesService,
    private readonly teamPitchEngagementService: TeamPitchEngagementService
  ) {}

  @Get(':slugOrUid/access')
  @UseGuards(UserTokenCheckGuard)
  @NoCache()
  async getAccess(@Param('slugOrUid') slugOrUid: string, @Req() req) {
    return this.teamPitchesService.getAccess(req.userEmail || null, slugOrUid);
  }

  @Get(':slugOrUid')
  @UseGuards(UserTokenCheckGuard)
  @NoCache()
  async getPitch(@Param('slugOrUid') slugOrUid: string, @Req() req) {
    return this.teamPitchProfilesService.getFullPitch(req.userEmail || null, slugOrUid);
  }

  @Patch(':slugOrUid/profile/description')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateDescription(@Param('slugOrUid') slugOrUid: string, @Req() req, @Body() body: UpdateTeamPitchProfileDto) {
    return this.teamPitchProfilesService.updateProfileDescription(req.userEmail, slugOrUid, body.description ?? null);
  }

  @Patch(':slugOrUid/profile/team')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateTeam(@Param('slugOrUid') slugOrUid: string, @Req() req, @Body() body: UpdateTeamPitchTeamDto) {
    return this.teamPitchProfilesService.updateTeam(req.userEmail, slugOrUid, body);
  }

  @Put(':slugOrUid/profile/one-pager')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async updateOnePager(@Param('slugOrUid') slugOrUid: string, @Req() req, @Body() body: { onePagerUploadUid: string }) {
    return this.teamPitchProfilesService.updateOnePager(req.userEmail, slugOrUid, body.onePagerUploadUid);
  }

  @Delete(':slugOrUid/profile/one-pager')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteOnePager(@Param('slugOrUid') slugOrUid: string, @Req() req) {
    return this.teamPitchProfilesService.deleteOnePager(req.userEmail, slugOrUid);
  }

  @Put(':slugOrUid/profile/video')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async updateVideo(@Param('slugOrUid') slugOrUid: string, @Req() req, @Body() body: { videoUploadUid: string }) {
    return this.teamPitchProfilesService.updateVideo(req.userEmail, slugOrUid, body.videoUploadUid);
  }

  @Delete(':slugOrUid/profile/video')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteVideo(@Param('slugOrUid') slugOrUid: string, @Req() req) {
    return this.teamPitchProfilesService.deleteVideo(req.userEmail, slugOrUid);
  }

  @Post(':slugOrUid/profile/video/upload-url')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async videoUploadUrl(
    @Param('slugOrUid') slugOrUid: string,
    @Req() req,
    @Body() body: { filename: string; filesize: number; mimetype: string }
  ) {
    return this.teamPitchProfilesService.generateVideoUploadUrl(
      req.userEmail,
      slugOrUid,
      body.filename,
      body.filesize,
      body.mimetype
    );
  }

  @Post(':slugOrUid/profile/video/confirm')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async confirmVideo(@Param('slugOrUid') slugOrUid: string, @Req() req, @Body() body: { uploadUid: string }) {
    return this.teamPitchProfilesService.confirmVideoUpload(req.userEmail, slugOrUid, body.uploadUid);
  }

  @Post(':slugOrUid/profile/one-pager/upload-url')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async onePagerUploadUrl(
    @Param('slugOrUid') slugOrUid: string,
    @Req() req,
    @Body() body: { filename: string; filesize: number; mimetype: string }
  ) {
    return this.teamPitchProfilesService.generateOnePagerUploadUrl(
      req.userEmail,
      slugOrUid,
      body.filename,
      body.filesize,
      body.mimetype
    );
  }

  @Post(':slugOrUid/profile/one-pager/confirm')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async confirmOnePager(@Param('slugOrUid') slugOrUid: string, @Req() req, @Body() body: { uploadUid: string }) {
    return this.teamPitchProfilesService.confirmOnePagerUpload(req.userEmail, slugOrUid, body.uploadUid);
  }

  @Post(':slugOrUid/profile/one-pager/preview')
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
    @Param('slugOrUid') slugOrUid: string,
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

    return this.teamPitchProfilesService.uploadOnePagerPreview(
      req.userEmail,
      slugOrUid,
      files.previewImage[0],
      files.previewImageSmall?.[0]
    );
  }

  @Post(':slugOrUid/express-interest')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async expressInterest(@Param('slugOrUid') slugOrUid: string, @Req() req, @Body() body: TeamPitchExpressInterestDto) {
    return this.teamPitchEngagementService.expressInterest(
      req.userEmail,
      slugOrUid,
      body.interestType,
      body.isPrep,
      body.teamPitchProfileUid,
      body.referralData,
      body.feedbackData
    );
  }

  @Patch(':slugOrUid/confidentiality-policy')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateConfidentiality(
    @Param('slugOrUid') slugOrUid: string,
    @Req() req,
    @Body() body: TeamPitchConfidentialityDto
  ) {
    return this.teamPitchesService.updateConfidentiality(req.userEmail, slugOrUid, body.accepted);
  }
}
