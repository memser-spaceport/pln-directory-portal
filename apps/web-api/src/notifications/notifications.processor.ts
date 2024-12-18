import { Process, Processor } from '@nestjs/bull';
import { NotificationService } from './notifications.service';
import { LogService } from '../shared/log.service';

@Processor('notifications')
export class NotificationConsumer {
  constructor(
    private readonly notificationService: NotificationService,
    private logger: LogService,
  ) {}
  @Process('notify')
  async process(job) {
    try {
      this.logger.info(`Processing notification with id: ${job.id}`);
      if (job.name === 'notify') {
        const {  } = job.data;
      }
    } catch (error) {
      this.logger.error(`Error occured while sending notification`, error);
    }
  }          
}
  