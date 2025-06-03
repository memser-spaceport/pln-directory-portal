import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import {
  CreateRecommendationRunRequest,
  GenerateMoreRecommendationsRequest,
  UpdateRecommendationRunStatusRequest,
  SendRecommendationsRequest,
} from 'libs/contracts/src/schema/recommendations';

@Controller('v1/admin/recommendations')
@UseGuards(AdminAuthGuard)
@NoCache()
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Post('runs')
  @NoCache()
  async createRecommendationRun(@Body() createDto: CreateRecommendationRunRequest) {
    return this.recommendationsService.createRecommendationRun(createDto);
  }

  @Post('runs/:uid/generate-more')
  @NoCache()
  async generateMoreRecommendations(
    @Param('uid') uid: string,
    @Body() generateDto: GenerateMoreRecommendationsRequest
  ) {
    return this.recommendationsService.generateMoreRecommendations(uid, generateDto);
  }

  @Get('runs')
  @NoCache()
  async getRecommendationRuns(@Query('targetMemberUid') targetMemberUid?: string, @Query('status') status?: string) {
    return this.recommendationsService.getRecommendationRuns(targetMemberUid, status);
  }

  @Get('runs/:uid')
  @NoCache()
  async getRecommendationRun(@Param('uid') uid: string) {
    return this.recommendationsService.getRecommendationRun(uid);
  }

  @Put('runs/:uid/status')
  @NoCache()
  async updateRecommendationRunStatus(
    @Param('uid') uid: string,
    @Body() updateDto: UpdateRecommendationRunStatusRequest
  ) {
    return this.recommendationsService.updateRecommendationRunStatus(uid, updateDto);
  }

  @Delete('runs/:uid')
  @NoCache()
  async deleteRecommendationRun(@Param('uid') uid: string) {
    return this.recommendationsService.deleteRecommendationRun(uid);
  }

  @Post('runs/:uid/send')
  @NoCache()
  async sendRecommendations(@Param('uid') uid: string, @Body() sendDto: SendRecommendationsRequest) {
    return this.recommendationsService.sendRecommendations(uid, sendDto);
  }
}
