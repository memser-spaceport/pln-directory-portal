import { Module } from '@nestjs/common';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { DataEnrichmentClientModule } from '../data-enrichment-client/data-enrichment-client.module';
import { RbacModule } from '../rbac/rbac.module';
import { SharedModule } from '../shared/shared.module';
import { AffinityController } from './affinity.controller';
import { AffinityEnrichmentTriggerService } from './affinity-enrichment-trigger.service';
import { AffinityQueryService } from './affinity-query.service';
import { AffinityServiceController } from './affinity-service.controller';
import { AffinityService } from './affinity.service';

@Module({
  imports: [SharedModule, RbacModule, AccessControlV2Module, DataEnrichmentClientModule],
  controllers: [AffinityServiceController, AffinityController],
  providers: [AffinityService, AffinityQueryService, AffinityEnrichmentTriggerService],
  exports: [AffinityService, AffinityQueryService],
})
export class AffinityModule {}
