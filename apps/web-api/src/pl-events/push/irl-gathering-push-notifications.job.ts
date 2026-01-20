import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IrlGatheringPushNotificationsProcessor } from './irl-gathering-push-notifications.processor';


const IRL_GATHERING_PUSH_CRON = process.env.IRL_GATHERING_PUSH_CRON ?? '*/5 * * * *';

@Injectable()
export class IrlGatheringPushNotificationsJob {
  private readonly logger = new Logger(IrlGatheringPushNotificationsJob.name);

  constructor(
    private readonly processor: IrlGatheringPushNotificationsProcessor
  ) {}

  @Cron(IRL_GATHERING_PUSH_CRON, {
    name: 'IrlGatheringPushNotificationsJob',
  })
  async run(): Promise<void> {
    // OFF by default
    const schedulerEnabled = (process.env.IRL_GATHERING_PUSH_SCHEDULER_ENABLED ?? 'false') === 'true';
    if (!schedulerEnabled) {
      this.logger.log('[IRL push job] Scheduler disabled via env. Exiting.');
      return;
    }

    this.logger.log('[IRL push job] Starting IRL gathering push notifications job');

    try {
      await this.processor.processUnprocessedCandidates();
    } catch (err: any) {
      this.logger.error(
        `[IRL push job] Processor failed. Error: ${err?.message || err}`,
        err?.stack
      );
    }

    this.logger.log('[IRL push job] Completed IRL gathering push notifications job');
  }
}
