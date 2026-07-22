import { Body, Controller, Get, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import {
  IngestMasterProfileDto,
  IngestMasterProfileResponse,
  ListMasterProfilesQueryDto,
  LookupMasterProfilesDto,
} from './dto/ingest-master-profile.dto';
import { MasterProfileService } from './master-profile.service';

/**
 * Service-to-service ingest + lookup for MasterProfile (Warm Intros v2).
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

  /** Paginated list for pairing jobs (`type=pl_internal|investor`). */
  @Get('master-profiles')
  async list(@Query() query: ListMasterProfilesQueryDto) {
    return this.masterProfileService.lookup(query);
  }

  /** Batch lookup by personKeys / affinityPersonIds. */
  @Post('master-profiles/lookup')
  async lookupBatch(@Body() dto: LookupMasterProfilesDto) {
    const n =
      (Array.isArray(dto?.personKeys) ? dto.personKeys.length : 0) +
      (Array.isArray(dto?.affinityPersonIds) ? dto.affinityPersonIds.length : 0);
    this.logger.log(`Received master-profile lookup batch: ids=${n}`);
    return this.masterProfileService.lookupBatch(dto);
  }
}
