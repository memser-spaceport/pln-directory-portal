import { Body, Controller, Get, Logger, Param, Patch, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { SkipEmptyStringToNull } from '../decorators/skip-empty-string-to-null.decorator';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import {
  ManualFieldsPatchAuthFilter,
  trackServiceManualFieldsPatch,
} from '../manual-field-lock/manual-field-lock.analytics';
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

  constructor(
    private readonly masterProfileService: MasterProfileService,
    private readonly analytics: AnalyticsService
  ) {}

  @Patch('master-profiles/:uid')
  @SkipEmptyStringToNull()
  @UseFilters(ManualFieldsPatchAuthFilter)
  async patchProfile(@Param('uid') uid: string, @Body() dto: PatchManualFieldsDto) {
    const fieldCount = dto?.fields && typeof dto.fields === 'object' ? Object.keys(dto.fields).length : 0;
    this.logger.log(`Received master-profile patch: uid=${uid} fields=${fieldCount}`);
    return trackServiceManualFieldsPatch(this.analytics, 'master_profile', uid, dto, () =>
      this.masterProfileService.patchFields(uid, dto?.fields, serviceActor(dto))
    );
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

  @Get('master-profiles/:uid')
  getByUid(@Param('uid') uid: string) {
    return this.masterProfileService.getByUid(uid);
  }
}
