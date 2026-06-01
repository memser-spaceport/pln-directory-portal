import { BadRequestException, Body, Controller, Get, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { FounderSourcingService } from './founder-sourcing.service';
import { IngestFounderSourcingDto, IngestFounderSourcingResponse } from './dto/ingest-founder-sourcing.dto';
import { ReviewStateExportResponseDto } from './dto/review-state.dto';

@ApiTags('Founder Sourcing - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
export class FounderSourcingServiceController {
  private readonly logger = new Logger(FounderSourcingServiceController.name);

  constructor(private readonly founderSourcingService: FounderSourcingService) {}

  @Post('founder-sourcing/ingest')
  async ingest(@Body() dto: IngestFounderSourcingDto): Promise<IngestFounderSourcingResponse> {
    if (!dto.items || !Array.isArray(dto.items)) {
      throw new BadRequestException('items array is required');
    }
    if (dto.items.length === 0) {
      throw new BadRequestException('items array cannot be empty');
    }

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      if (!item || typeof item !== 'object') {
        throw new BadRequestException(`Item ${i}: item must be an object`);
      }
      if (typeof item.founder_id !== 'string' || item.founder_id.trim() === '') {
        throw new BadRequestException(`Item ${i}: founder_id is required`);
      }
      if (typeof item.dedupe_key !== 'string' || item.dedupe_key.trim() === '') {
        throw new BadRequestException(`Item ${i}: dedupe_key is required`);
      }
      if (typeof item.source !== 'string' || item.source.trim() === '') {
        throw new BadRequestException(`Item ${i}: source is required`);
      }
      if (!Array.isArray(item.sources) || item.sources.length === 0) {
        throw new BadRequestException(`Item ${i}: sources is required and must be a non-empty array`);
      }
    }

    this.logger.log(
      `Received founder-sourcing ingest: items=${dto.items.length} runId=${dto.runId ?? 'none'} source=${
        dto.source ?? 'none'
      }`
    );
    return this.founderSourcingService.ingest(dto);
  }

  @Get('founder-sourcing/review-state')
  async reviewState(@Query('since') since?: string): Promise<ReviewStateExportResponseDto> {
    const items = await this.founderSourcingService.exportReviewState(since);
    return { items };
  }
}
