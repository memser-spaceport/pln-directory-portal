import { Injectable, Logger } from '@nestjs/common';
import { SqsMessageHandler } from '@ssut/nestjs-sqs';
import { PLEventGuestSyncService } from './pl-event-guest-sync.service';
import { PLEventGuestSyncMessage } from './pl-event-guest-sync.interface';

const QUEUE_NAME = process.env.PL_EVENT_GUEST_SYNC_QUEUE_NAME ?? 'pl-event-guest-sync';

/**
 * SQS consumer for PLEvent guest synchronization
 */
@Injectable()
export class PLEventGuestSyncConsumer {
  private readonly logger = new Logger(PLEventGuestSyncConsumer.name);

  constructor(private readonly guestSyncService: PLEventGuestSyncService) {}

  /**
   * Handles messages from the guest sync queue
   */
  @SqsMessageHandler(QUEUE_NAME)
  async handleMessage(message: any): Promise<void> {
    try {
      const body: PLEventGuestSyncMessage = typeof message.Body === 'string' 
        ? JSON.parse(message.Body)
        : message.Body;
      this.logger.log(`[Consumer] Processing event: ${body.eventUid}`);
      const result = await this.guestSyncService.processEvent(body);
      this.logger.log(
        `[Consumer] Done: ${body.eventUid} - ${result.processed}/${result.totalNoOfGuests} guests processed`
      );
    } catch (error) {
      this.logger.error(`[Consumer] Failed: ${error.message}`, error.stack);
      throw error; // Trigger SQS retry
    }
  }
}
