import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { OptionalUserTokenCheckGuard } from '../guards/user-token-check.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { SpvAccessRequestDto } from 'libs/contracts/src/schema/spv-spotlight';
import { SpvSpotlightsService } from './spv-spotlights.service';

@ApiTags('SPV Spotlights')
@Controller('v1/spv-spotlights')
export class SpvSpotlightsController {
  constructor(private readonly spvSpotlightsService: SpvSpotlightsService) {}

  @Get(':slug')
  @UseGuards(OptionalUserTokenCheckGuard)
  @NoCache()
  async getBySlug(@Param('slug') slug: string, @Req() req) {
    return this.spvSpotlightsService.getBySlug(slug, req.userEmail || null);
  }

  @Post(':slug/access-requests')
  @HttpCode(201)
  @UseGuards(OptionalUserTokenCheckGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async requestAccess(@Param('slug') slug: string, @Body() body: SpvAccessRequestDto, @Req() req) {
    return this.spvSpotlightsService.requestAccess(slug, body, req.userEmail || null);
  }
}
