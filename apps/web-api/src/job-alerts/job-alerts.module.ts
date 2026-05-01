import { Module } from '@nestjs/common';
import { JobOpeningsModule } from '../job-openings/job-openings.module';
import { SharedModule } from '../shared/shared.module';
import { AwsService } from '../utils/aws/aws.service';
import { JobAlertsController } from './job-alerts.controller';
import { JobAlertsDispatchService } from './job-alerts-dispatch.service';
import { JobAlertsPublicController } from './job-alerts-public.controller';
import { JobAlertsService } from './job-alerts.service';

@Module({
  imports: [SharedModule, JobOpeningsModule],
  controllers: [JobAlertsController, JobAlertsPublicController],
  providers: [JobAlertsService, JobAlertsDispatchService, AwsService],
  exports: [JobAlertsService, JobAlertsDispatchService],
})
export class JobAlertsModule {}
