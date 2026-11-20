import { Module, forwardRef } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { IntroRequestTelegram } from './intro-request-telegram';
import { IntroRequestsController } from './intro-requests.controller';
import { IntroRequestsJob } from './intro-requests.job';
import { IntroRequestsService } from './intro-requests.service';

@Module({
  imports: [forwardRef(() => MembersModule)],
  controllers: [IntroRequestsController],
  providers: [IntroRequestsService, IntroRequestsJob, IntroRequestTelegram],
  // The LabOS agent (LAB-3300) reuses the sender rule and the target lookup.
  exports: [IntroRequestsService],
})
export class IntroRequestsModule {}
