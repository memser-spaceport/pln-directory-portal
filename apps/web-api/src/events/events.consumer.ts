import { Injectable } from '@nestjs/common';
import { SqsMessageHandler } from '@ssut/nestjs-sqs';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { PLEventType, PLEventLocationStatus } from '@prisma/client';
import { UPSERT, DELETE } from '../utils/constants';
import { EventConsumerHelper } from './event-consumer.helper';

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
    private helperService: EventConsumerHelper
  ) {}

  /**
   * Process event operation message from SQS
   * Handles create, update, and delete operations for PLEvent table
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
   * Handle event UPSERT operation
   * Creates event if it doesn't exist; updates otherwise. Also handles location creation/association.
   * @param event - Event data
   * @param location - Location data
   */
  private async handleEventUpsert(event, location): Promise<void> {
    try {
      this.logger.info(`Upserting event: ${event.externalId}`, 'EventsConsumer');
      // Wrap entire operation in a transaction
      await this.prisma.$transaction(async (tx) => {
        // Handle location creation and association only for physical events
        const result = event?.type != PLEventType.VIRTUAL ? 
          await this.helperService.handleLocationAndAssociation(location, tx):
          { locationUid: null, associationUid: null };
        const locationUid = result.locationUid;
        const associationUid = result.associationUid;
        const locationStatus = location.isInferred ? PLEventLocationStatus.AUTO_MAPPED : PLEventLocationStatus.MANUALLY_MAPPED;
        // Try to find by externalId first
        let existingEvent = await this.helperService.findEventByExternalId(event.externalId);
        if (existingEvent) {
          await this.plEventsService.updateEventByUid(existingEvent.uid, {
            ...event,
            locationStatus,
            locationUid,
            pLEventLocationAssociationUid: associationUid
          }, tx);
          this.logger.info(`Updated existing event: ${existingEvent.uid}`, 'EventsConsumer');
        } else {
          await this.plEventsService.createPLEvent({
            ...event,
            locationStatus,
            locationUid,
            pLEventLocationAssociationUid: associationUid
          }, tx);
          this.logger.info(`Created new event with externalId: ${event.externalId}`, 'EventsConsumer');
        }
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
