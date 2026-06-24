import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SharedModule } from '../shared/shared.module';
import { AffinityController } from './affinity.controller';
import { AffinityQueryService } from './affinity-query.service';
import { AffinityServiceController } from './affinity-service.controller';
import { AffinityService } from './affinity.service';

@Module({
  imports: [SharedModule, RbacModule],
  controllers: [AffinityServiceController, AffinityController],
  providers: [AffinityService, AffinityQueryService],
  exports: [AffinityService, AffinityQueryService],
})
export class AffinityModule {}
