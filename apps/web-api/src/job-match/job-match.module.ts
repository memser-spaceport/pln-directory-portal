import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { SuggestedCandidatesEmailPreferenceModule } from '../notification-settings/suggested-candidates-email-preference.module';
import { SharedModule } from '../shared/shared.module';
import { JobMatchController } from './job-match.controller';
import { JobMatchJob } from './job-match.job';
import { JobMatchPublicController } from './job-match-public.controller';
import { JobMatchRunner } from './job-match-runner.service';
import { JobMatchServiceController } from './job-match-service.controller';
import { JobMatchService } from './job-match.service';
import { SuggestedCandidatesEmailService } from './suggested-candidates-email.service';

@Module({
  imports: [SharedModule, MembersModule, SuggestedCandidatesEmailPreferenceModule],
  controllers: [JobMatchController, JobMatchServiceController, JobMatchPublicController],
  providers: [JobMatchRunner, JobMatchService, JobMatchJob, SuggestedCandidatesEmailService],
  exports: [JobMatchService],
})
export class JobMatchModule {}
