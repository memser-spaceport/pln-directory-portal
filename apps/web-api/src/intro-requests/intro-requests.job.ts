import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IntroRequestsService } from './intro-requests.service';

@Injectable()
export class IntroRequestsJob {
  constructor(private readonly introRequestsService: IntroRequestsService) {}

  @Cron('* * * * *', { name: 'intro-request-telegram-retry', timeZone: 'UTC' })
  retry(): Promise<void> {
    return this.introRequestsService.retryPending();
  }
}
