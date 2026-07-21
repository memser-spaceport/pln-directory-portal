import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { IngestMasterProfileDto, IngestMasterProfileResponse } from './dto/ingest-master-profile.dto';
import { MasterProfileService } from './master-profile.service';

/**
 * Service-to-service ingest for MasterProfile (Warm Intros v2).
 * Mirrors pathfinder / investor-outreach service auth + route prefix.
 */
@ApiTags('Master Profile - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
export class MasterProfileServiceController {
  private readonly logger = new Logger(MasterProfileServiceController.name);

  constructor(private readonly masterProfileService: MasterProfileService) {}

  @Post('master-profiles/ingest')
  async ingest(@Body() dto: IngestMasterProfileDto): Promise<IngestMasterProfileResponse> {
    this.logger.log(
      `Received master-profile ingest: profiles=${dto?.profiles?.length ?? 0} runId=${dto?.runId ?? 'none'}`
    );
    return this.masterProfileService.ingest(dto);
  }
}
