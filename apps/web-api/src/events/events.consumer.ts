import { Injectable } from '@nestjs/common';
import { SqsMessageHandler } from '@ssut/nestjs-sqs';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { PLEventType, PLEventLocationStatus } from '@prisma/client';
import { UPSERT, DELETE } from '../utils/constants';
import { EventConsumerHelper } from './event-consumer.helper';
import { EventGuestSyncHelper } from './event-guests-sync.helper';

export type EventOperationType = 'UPSERT'| 'DELETE';

export interface EventCreationPayload {
  type: EventOperationType;
  event: any;
  location?: any;
  isInferred?: boolean;
  requestorEmail: string;
}

@Injectable()
export class EventsConsumer {
  constructor(
    private logger: LogService,
    private prisma: PrismaService,
    private plEventsService: PLEventsService,
    private helperService: EventConsumerHelper,
    private guestSyncHelper: EventGuestSyncHelper
  ) {}

  /**
   * Process event operation message from SQS
   * Handles create, update, and delete operations for PLEvent table
   * Also syncs host/co-host associations from events-service
   * @param message - SQS message containing event operation payload
   * @returns Promise<void>
   */
  @SqsMessageHandler('events')
  async processEventOperation(message: any): Promise<void> {
    try {
      this.logger.info(`Processing event operation message with id: ${message.MessageId}`, 'EventsConsumer');
      // Parse the message body
      const payload: EventCreationPayload = JSON.parse(message.Body)?.body;
      const { type, event, location = {}, isInferred=false } = payload;
      const formattedEvent = await this.helperService.mapEventData(event);
      switch (type) {
        case UPSERT:
          await this.handleEventUpsert(formattedEvent, { ...location, ...event.address_info, isInferred });
          break;
        case DELETE:
          await this.handleEventDeletion(formattedEvent);
          break;
        default:
          this.logger.error(`Unsupported event operation type: ${type}`, 'EventsConsumer');
          break;
      }
      this.logger.info(`Successfully processed event operation ${type} of event: ${formattedEvent.externalId} with id: ${message.MessageId}`, 'EventsConsumer');
    } catch (error) {
      this.logger.error(`Error processing event operation message ${message.MessageId}: ${error.message}`, error.stack, 'EventsConsumer');
      throw error; // Re-throw to trigger SQS retry mechanism
    }
  }

  /**
   * Handle event UPSERT operation.
   * 
   * Flow:
   * 1. Handle location creation/association (for physical events)
   * 2. Sync event (create or update)
   * 3. Sync associations
   * 4. Sync guests for member associations
   * 
   * @param event - Event data
   * @param location - Location data
   */
  private async handleEventUpsert(event, location): Promise<void> {
    try {
      this.logger.info(`Upserting event: ${event.externalId}`, 'EventsConsumer');
      
      await this.prisma.$transaction(async (tx) => {
        // Step 1: Handle location (only for physical events)
        const { locationUid, associationUid } = event?.type !== PLEventType.VIRTUAL 
          ? await this.helperService.handleLocationAndAssociation(location, tx)
          : { locationUid: null, associationUid: null };

        if (!locationUid) {
          this.logger.error(`Location not found for event: ${event.externalId} with type: ${event.type}`, 'EventsConsumer');
          return;
        }
        
        const locationStatus = location.isInferred 
          ? PLEventLocationStatus.AUTO_MAPPED 
          : PLEventLocationStatus.MANUALLY_MAPPED;
        
        // Step 2: Sync event (create or update)
        const eventUid = await this.helperService.syncEvent(
          event,
          locationUid ?? null,
          associationUid ?? null,
          locationStatus,
          tx
        );
        
        // Step 3: Sync associations
        const processedAssociations = await this.helperService.syncEventAssociations(
          eventUid,
          event.externalId,
          event.associations,
          tx
        );
        
        // Step 4: Sync guests (member + team associations)
        await this.guestSyncHelper.syncEventGuests(
          eventUid,
          locationUid,
          processedAssociations,
          tx
        );
      });
    } catch (error) {
      this.logger.error(`Error handling event upsert: ${error.message}`, error.stack, 'EventsConsumer');
      throw error;
    }
  }

  /**
   * Handle event deletion operation (soft delete)
   * @param event - Event data
   */
  private async handleEventDeletion(event): Promise<void> {
    try {
      this.logger.info(`Deleting event: ${event?.externalId}`, 'EventsConsumer');
      const foundEvent = await this.helperService.findEventByExternalId(event.externalId);
      if (foundEvent) {
        await this.plEventsService.deleteEventByUid(foundEvent?.uid);
        this.logger.info(`Successfully deleted event: ${event.externalId}`, 'EventsConsumer');
      } else {
        this.logger.info(`Event not found: ${event.externalId}`, 'EventsConsumer');
      }
    } catch (error) {
      this.logger.error(`Error handling event deletion: ${error.message}`, error.stack, 'EventsConsumer');
      throw error;
    }
  }
} 
