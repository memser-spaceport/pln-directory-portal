import { BadRequestException, Body, Controller, Get, Logger, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { TeamNewsService } from './team-news.service';
import { TeamNewsEnrichmentService } from './team-news-enrichment.service';
import {
  BatchUpdateTeamNewsEnrichmentDto,
  IngestTeamNewsDto,
  IngestTeamNewsResponse,
} from './dto/ingest-team-news.dto';
import {
  BatchUpdateTeamNewsEnrichmentResponse,
  TeamNewsPerTeamResponse,
  TeamsWithNewsEnrichmentResponse,
} from 'libs/contracts/src/schema/team-news';

@ApiTags('Team News - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
export class TeamNewsServiceController {
  private readonly logger = new Logger(TeamNewsServiceController.name);

  constructor(
    private readonly teamNewsService: TeamNewsService,
    private readonly enrichmentService: TeamNewsEnrichmentService
  ) {}

  @Post('team-news/ingest')
  async ingest(@Body() dto: IngestTeamNewsDto): Promise<IngestTeamNewsResponse> {
    if (!dto.items || !Array.isArray(dto.items)) {
      throw new BadRequestException('items array is required');
    }
    if (dto.items.length === 0) {
      throw new BadRequestException('items array cannot be empty');
    }

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      if (!item.teamUid) throw new BadRequestException(`Item ${i}: teamUid is required`);
      if (!item.title) throw new BadRequestException(`Item ${i}: title is required`);
      if (!item.sourceUrl) throw new BadRequestException(`Item ${i}: sourceUrl is required`);
      if (!item.eventDate) throw new BadRequestException(`Item ${i}: eventDate is required`);
      if (!item.eventType) throw new BadRequestException(`Item ${i}: eventType is required`);
      if (!Array.isArray(item.tags)) throw new BadRequestException(`Item ${i}: tags must be an array`);
    }

    this.logger.log(
      `Received team-news ingest: items=${dto.items.length} runId=${dto.runId ?? 'none'} source=${dto.source ?? 'none'}`
    );
    return this.teamNewsService.ingestTeamNews(dto);
  }

  @Get('teams-with-news-enrichment')
  @NoCache()
  async getTeamsWithEnrichment(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('priority') priority?: string | string[]
  ): Promise<TeamsWithNewsEnrichmentResponse> {
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.min(1000, Math.max(1, Number(limit) || 100));

    let priorityFilter: number[] | undefined;
    if (priority) {
      const priorities = Array.isArray(priority) ? priority : [priority];
      priorityFilter = priorities.map((p) => Number(p)).filter((p) => !isNaN(p) && p >= 1);
    }

    return this.enrichmentService.getTeamsWithEnrichment(parsedPage, parsedLimit, priorityFilter);
  }

  @Get('teams/:uid/team-news')
  @NoCache()
  async getTeamNewsByTeam(@Param('uid') uid: string): Promise<TeamNewsPerTeamResponse> {
    return this.enrichmentService.getTeamNewsByTeam(uid);
  }

  @Post('team-news-enrichment/batch')
  async batchUpdateEnrichment(
    @Body() dto: BatchUpdateTeamNewsEnrichmentDto
  ): Promise<BatchUpdateTeamNewsEnrichmentResponse> {
    if (!dto.items || !Array.isArray(dto.items)) {
      throw new BadRequestException('items array is required');
    }
    if (dto.items.length === 0) {
      throw new BadRequestException('items array cannot be empty');
    }
    for (let i = 0; i < dto.items.length; i++) {
      if (!dto.items[i].teamUid) {
        throw new BadRequestException(`Item ${i}: teamUid is required`);
      }
    }

    this.logger.log(`Received team-news enrichment batch: items=${dto.items.length}`);
    return this.enrichmentService.batchUpdateEnrichment(dto.items);
  }
}
