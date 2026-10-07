import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { SharedModule } from '../shared/shared.module';
import { JobMatchController } from './job-match.controller';
import { JobMatchJob } from './job-match.job';
import { JobMatchRunner } from './job-match-runner.service';
import { JobMatchServiceController } from './job-match-service.controller';
import { JobMatchService } from './job-match.service';

@Module({
  imports: [SharedModule, MembersModule],
  controllers: [JobMatchController, JobMatchServiceController],
  providers: [JobMatchRunner, JobMatchService, JobMatchJob],
})
export class JobMatchModule {}
