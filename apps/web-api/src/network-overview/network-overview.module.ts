import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { JobOpeningsModule } from '../job-openings/job-openings.module';
import { NetworkOverviewController } from './network-overview.controller';
import { NetworkOverviewServiceController } from './network-overview-service.controller';
import { NetworkOverviewService } from './network-overview.service';

@Module({
  imports: [SharedModule, JobOpeningsModule],
  controllers: [NetworkOverviewController, NetworkOverviewServiceController],
  providers: [NetworkOverviewService],
  exports: [NetworkOverviewService],
})
export class NetworkOverviewModule {}
