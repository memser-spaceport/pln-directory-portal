import { Injectable } from '@nestjs/common';
import { SqsMessageHandler } from '@ssut/nestjs-sqs';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { PLEventType, PLEventLocationStatus } from '@prisma/client';
import { UPSERT, DELETE } from '../utils/constants';
import { EventConsumerHelper } from './event-consumer.helper';
import { EventGuestSyncHelper } from './event-guests-sync.helper';
import { PLEventSyncService } from '../pl-events/pl-event-sync.service';

/** A slow events service must not hold up the queue. */
const DETAILS_REFRESH_TIMEOUT_MS = 10_000;

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
    private guestSyncHelper: EventGuestSyncHelper,
    private eventSyncService: PLEventSyncService
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
      const payload: EventCreationPayload = JSON.parse(message.Body)?.body;
      const { type, event, location = {}, isInferred=false } = payload;
      const formattedEvent = await this.helperService.mapEventData(event);
      switch (type) {
        case UPSERT:
          if (await this.handleEventUpsert(formattedEvent, { ...location, ...event.address_info, isInferred })) {
            await this.refreshEventDetails(formattedEvent.externalId);
          }
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
   * @returns true when the event was saved, false when it was left out for having no location
   */
  private async handleEventUpsert(event, location): Promise<boolean> {
    try {
      this.logger.info(`Upserting event: ${event.externalId}`, 'EventsConsumer');
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Handle location (only for physical events)
        const { locationUid, associationUid } = event?.type !== PLEventType.VIRTUAL 
          ? await this.helperService.handleLocationAndAssociation(location, tx)
          : { locationUid: null, associationUid: null };

        if (!locationUid) {
          this.logger.error(`Location not found for event: ${event.externalId} with type: ${event.type}`, 'EventsConsumer');
          return false;
        }
        
        const locationStatus = location.isInferred 
          ? PLEventLocationStatus.AUTO_MAPPED 
          : PLEventLocationStatus.MANUALLY_MAPPED;
        
        // Step 2: Sync event (create or update)
        // Explicitly exclude associations as they're handled separately
        const { associations, ...eventData } = event;
        const eventUid = await this.helperService.syncEvent(
          eventData,
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
        return true;
      });
    } catch (error) {
      this.logger.error(`Error handling event upsert: ${error.message}`, error.stack, 'EventsConsumer');
      throw error;
    }
  }

  /**
   * LAB-3403: the message carries only part of the event's details, so the rest is read from the events service right
   * after the event is saved. A failure is logged and nothing else: the event is saved and keeps its stored details,
   * and throwing would make SQS deliver the whole message again.
   * @param externalId - The event's id in the events service
   */
  private async refreshEventDetails(externalId: string): Promise<void> {
    try {
      await this.eventSyncService.syncEventDetailsOnly({
        selectedEventUids: [externalId],
        timeoutMs: DETAILS_REFRESH_TIMEOUT_MS,
      });
    } catch (error) {
      this.logger.error(
        `Could not refresh the details of event ${externalId}: ${error.message}`,
        error.stack,
        'EventsConsumer'
      );
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
