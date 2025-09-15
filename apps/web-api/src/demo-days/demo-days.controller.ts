import {
  Controller,
  Get,
  UseGuards,
  Req,
  Put,
  Delete,
  Patch,
  Body,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { DemoDaysService } from './demo-days.service';
import { DemoDayFundraisingProfilesService } from './demo-day-fundraising-profiles.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { UploadsService } from '../uploads/uploads.service';
import { UploadKind, UploadScopeType } from '@prisma/client';

@ApiTags('Demo Days')
@Controller('v1/demo-days')
export class DemoDaysController {
  constructor(
    private readonly demoDaysService: DemoDaysService,
    private readonly demoDayFundraisingProfilesService: DemoDayFundraisingProfilesService,
    private readonly uploadsService: UploadsService
  ) {}

  @Get('current')
  @UseGuards(UserTokenValidation)
  async getCurrentDemoDay(@Req() req) {
    return this.demoDaysService.getCurrentDemoDayAccess(req.userEmail);
  }

  // Fundraising endpoints

  @Get('current/fundraising-profile')
  @UseGuards(UserTokenValidation)
  async getCurrentDemoDayFundraisingProfile(@Req() req) {
    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfile(req.userEmail);
  }

  @Put('current/fundraising-profile/one-pager')
  @UseGuards(UserTokenValidation)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'onePagerFile', maxCount: 1 }]))
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
  async deleteOnePager(@Req() req) {
    return this.demoDayFundraisingProfilesService.deleteFundraisingOnePager(req.userEmail);
  }

  @Put('current/fundraising-profile/video')
  @UseGuards(UserTokenValidation)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'videoFile', maxCount: 1 }]))
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

  @Delete('current/fundraising-profile/video')
  @UseGuards(UserTokenValidation)
  async deleteVideo(@Req() req) {
    return this.demoDayFundraisingProfilesService.deleteFundraisingVideo(req.userEmail);
  }

  @Patch('current/fundraising-profile/team')
  @UseGuards(UserTokenValidation)
  async updateTeam(
    @Req() req,
    @Body()
    body: {
      name?: string;
      shortDescription?: string;
      industryTags?: string[];
      fundingStage?: string;
      logo?: string;
    }
  ) {
    return this.demoDayFundraisingProfilesService.updateFundraisingTeam(req.userEmail, body);
  }
}
