import { Controller, Post, Body, UseGuards, BadRequestException, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { JobOpeningsService } from './job-openings.service';
import { IngestJobOpeningsDto, IngestJobOpeningsResponse } from './dto/ingest-job-openings.dto';

@ApiTags('Job Openings - Service')
@Controller('v1/service/job-openings')
@UseGuards(ServiceAuthGuard)
export class JobOpeningsServiceController {
  private readonly logger = new Logger(JobOpeningsServiceController.name);

  constructor(private readonly jobOpeningsService: JobOpeningsService) {}

  @Post('ingest')
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
}
