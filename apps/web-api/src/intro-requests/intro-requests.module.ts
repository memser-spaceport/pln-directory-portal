import { Module } from '@nestjs/common';
import { IntroRequestTelegram } from './intro-request-telegram';
import { IntroRequestsController } from './intro-requests.controller';
import { IntroRequestsJob } from './intro-requests.job';
import { IntroRequestsService } from './intro-requests.service';

@Module({
  controllers: [IntroRequestsController],
  providers: [IntroRequestsService, IntroRequestsJob, IntroRequestTelegram],
})
export class IntroRequestsModule {}
