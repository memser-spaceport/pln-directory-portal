import { Controller, Post, Body, UseGuards, BadRequestException, Logger, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { JobOpeningsService } from './job-openings.service';
import { JobOpeningsEnrichmentService } from './job-openings-enrichment.service';
import { IngestJobOpeningsDto, IngestJobOpeningsResponse } from './dto/ingest-job-openings.dto';
import { BatchUpdateEnrichmentDto } from './dto/batch-update-enrichment.dto';
import {
  TeamsWithEnrichmentResponse,
  JobOpeningsPerTeamResponse,
  BatchUpdateEnrichmentResponse,
} from 'libs/contracts/src/schema/team-job-enrichment';

@ApiTags('Job Openings - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
export class JobOpeningsServiceController {
  private readonly logger = new Logger(JobOpeningsServiceController.name);

  constructor(
    private readonly jobOpeningsService: JobOpeningsService,
    private readonly enrichmentService: JobOpeningsEnrichmentService
  ) {}

  @Post('job-openings/ingest')
  async ingest(@Body() dto: IngestJobOpeningsDto): Promise<IngestJobOpeningsResponse> {
    if (!dto.jobs || !Array.isArray(dto.jobs)) {
      throw new BadRequestException('jobs array is required');
    }

    if (dto.jobs.length === 0) {
      throw new BadRequestException('jobs array cannot be empty');
    }

    // Validate required fields for each job
    for (let i = 0; i < dto.jobs.length; i++) {
      const job = dto.jobs[i];
      if (!job.companyName) {
        throw new BadRequestException(`Job at index ${i}: companyName is required`);
      }
      if (!job.roleTitle) {
        throw new BadRequestException(`Job at index ${i}: roleTitle is required`);
      }
      if (!job.canonicalKey) {
        throw new BadRequestException(`Job at index ${i}: canonicalKey is required`);
      }
      if (!job.detectionDate) {
        throw new BadRequestException(`Job at index ${i}: detectionDate is required`);
      }
    }

    this.logger.log(`Received ingest request with ${dto.jobs.length} jobs (runId: ${dto.runId ?? 'none'})`);

    const result = await this.jobOpeningsService.ingestJobOpenings(dto.jobs);

    this.logger.log(`Ingest complete: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

    return result;
  }

  @Get('teams-with-enrichment')
  @NoCache()
  async getTeamsWithEnrichment(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('priority') priority?: string | string[]
  ): Promise<TeamsWithEnrichmentResponse> {
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.min(1000, Math.max(1, Number(limit) || 100));

    let priorityFilter: number[] | undefined;
    if (priority) {
      const priorities = Array.isArray(priority) ? priority : [priority];
      priorityFilter = priorities.map((p) => Number(p)).filter((p) => !isNaN(p) && p >= 1);
    }

    return this.enrichmentService.getTeamsWithEnrichment(parsedPage, parsedLimit, priorityFilter);
  }

  @Get('teams/:uid/job-openings')
  async getJobOpeningsByTeam(@Param('uid') uid: string): Promise<JobOpeningsPerTeamResponse> {
    return this.enrichmentService.getJobOpeningsByTeam(uid);
  }

  @Post('team-enrichment/batch')
  async batchUpdateEnrichment(@Body() dto: BatchUpdateEnrichmentDto): Promise<BatchUpdateEnrichmentResponse> {
    if (!dto.items || !Array.isArray(dto.items)) {
      throw new BadRequestException('items array is required');
    }

    if (dto.items.length === 0) {
      throw new BadRequestException('items array cannot be empty');
    }

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      if (!item.teamUid) {
        throw new BadRequestException(`Item at index ${i}: teamUid is required`);
      }
    }

    this.logger.log(`Received batch enrichment update with ${dto.items.length} items`);

    const result = await this.enrichmentService.batchUpdateEnrichment(dto.items);

    this.logger.log(
      `Batch update complete: ${result.created} created, ${result.updated} updated, ${result.failed} failed`
    );

    return result;
  }
}
