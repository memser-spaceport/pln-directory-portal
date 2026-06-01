import { Module } from '@nestjs/common';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { RbacModule } from '../rbac/rbac.module';
import { SharedModule } from '../shared/shared.module';
import { FounderSourcingController } from './founder-sourcing.controller';
import { FounderSourcingQueryService } from './founder-sourcing-query.service';
import { FounderSourcingReviewService } from './founder-sourcing-review.service';
import { FounderSourcingServiceController } from './founder-sourcing-service.controller';
import { FounderSourcingService } from './founder-sourcing.service';

@Module({
  imports: [SharedModule, RbacModule, AccessControlV2Module],
  controllers: [FounderSourcingServiceController, FounderSourcingController],
  providers: [FounderSourcingService, FounderSourcingQueryService, FounderSourcingReviewService],
  exports: [FounderSourcingService],
})
export class FounderSourcingModule {}
