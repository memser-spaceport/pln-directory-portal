import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import {
  IngestConnectionEdgesDto,
  IngestWarmIntrosV2Response,
  IngestWarmPathsV2Dto,
} from './dto/ingest-warm-intros-v2.dto';
import { WarmIntrosV2Service } from './warm-intros-v2.service';

/**
 * Service-to-service ingest for ConnectionEdge + WarmPathV2 (Warm Intros v2).
 * Mirrors MasterProfile service auth + route prefix.
 */
@ApiTags('Warm Intros v2 - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
export class WarmIntrosV2ServiceController {
  private readonly logger = new Logger(WarmIntrosV2ServiceController.name);

  constructor(private readonly warmIntrosV2Service: WarmIntrosV2Service) {}

  @Post('warm-intros-v2/edges/ingest')
  async ingestEdges(@Body() dto: IngestConnectionEdgesDto): Promise<IngestWarmIntrosV2Response> {
    this.logger.log(
      `Received warm-intros-v2 edge ingest: edges=${dto?.edges?.length ?? 0} runId=${dto?.runId ?? 'none'}`
    );
    return this.warmIntrosV2Service.ingestEdges(dto);
  }

  @Post('warm-intros-v2/paths/ingest')
  async ingestPaths(@Body() dto: IngestWarmPathsV2Dto): Promise<IngestWarmIntrosV2Response> {
    this.logger.log(
      `Received warm-intros-v2 path ingest: paths=${dto?.paths?.length ?? 0} runId=${dto?.runId ?? 'none'}`
    );
    return this.warmIntrosV2Service.ingestPaths(dto);
  }
}
