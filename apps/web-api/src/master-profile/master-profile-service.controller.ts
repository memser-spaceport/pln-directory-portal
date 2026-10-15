import { Body, Controller, Get, Logger, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipEmptyStringToNull } from '../decorators/skip-empty-string-to-null.decorator';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { PatchManualFieldsDto, serviceActor } from '../manual-field-lock/manual-field-lock.service';
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

  @Patch('master-profiles/:uid')
  @SkipEmptyStringToNull()
  async patchProfile(@Param('uid') uid: string, @Body() dto: PatchManualFieldsDto) {
    const fieldCount = dto?.fields && typeof dto.fields === 'object' ? Object.keys(dto.fields).length : 0;
    this.logger.log(`Received master-profile patch: uid=${uid} fields=${fieldCount}`);
    return this.masterProfileService.patchFields(uid, dto?.fields, serviceActor(dto));
  }

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
