import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { IngestPathfinderDto, IngestPathfinderResponse } from './dto/ingest-pathfinder.dto';
import { PathfinderService } from './pathfinder.service';

/**
 * Service-to-service ingest for computed paths (mirrors the investor-outreach
 * ingest pattern + auth). Called by the offline graph job in pln-data-enrichment.
 */
@ApiTags('Path Finder - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
export class PathfinderServiceController {
  private readonly logger = new Logger(PathfinderServiceController.name);

  constructor(private readonly pathfinderService: PathfinderService) {}

  @Post('pathfinder/ingest')
  async ingest(@Body() dto: IngestPathfinderDto): Promise<IngestPathfinderResponse> {
    this.logger.log(
      `Received pathfinder ingest: targetSet=${dto?.targetSet ?? 'none'} ` +
        `paths=${dto?.paths?.length ?? 0} runId=${dto?.runId ?? 'none'}`
    );
    return this.pathfinderService.ingest(dto);
  }
}
