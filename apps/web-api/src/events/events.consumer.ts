import { Injectable } from '@nestjs/common';
import { SqsMessageHandler } from '@ssut/nestjs-sqs';
import { LogService } from '../shared/log.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { PLEventLocationAssociationService } from '../pl-events/pl-event-location-association.service';
import { PLEventLocationsService } from '../pl-events/pl-event-locations.service';
import { PrismaService } from '../shared/prisma.service';
import { getFilenameFromUrl, getFileTypeFromUrl } from '../utils/helper/helper';
import { PLEventLocation, PLEvent, PLEventType } from '@prisma/client';
import { UPSERT, DELETE } from '../utils/constants';

export type EventOperationType = 'UPSERT'| 'DELETE';

export interface EventCreationPayload {
  type: EventOperationType;
  event: any;
  location?: any;
  requestorEmail: string;
}

@Injectable()
export class EventsConsumer {
  constructor(
    private logger: LogService,
    private plEventsService: PLEventsService,
    private prisma: PrismaService,
    private locationAssociationService: PLEventLocationAssociationService,
    private plEventLocationsService: PLEventLocationsService
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
      const payload: EventCreationPayload = JSON.parse(message.Body);
      const { type, event, location = {} } = payload;
      const formattedEvent = await this.mapEventData(event);
      switch (type) {
        case UPSERT:
          await this.handleEventUpsert(formattedEvent, { ...location, ...event.address_info });
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
      this.logger.info(`Upserting event: ${event.externalId ?? event.slugURL}`, 'EventsConsumer');
      // Handle location creation and association only for physical events
      const locationUid = event?.format != PLEventType.VIRTUAL ? await this.handleLocationAndAssociation(location): null;
      // Try to find by externalId first
      let existingEvent = await this.findEventByExternalId(event.externalId);
      if (existingEvent) {
        await this.plEventsService.updateEventByUid(existingEvent.uid, {
          ...event,
          locationUid: locationUid
        });
        this.logger.info(`Updated existing event: ${existingEvent.uid}`, 'EventsConsumer');
      } else {
        await this.plEventsService.createPLEvent({
          ...event,
          locationUid: locationUid
        });
        this.logger.info(`Created new event with externalId: ${event.externalId}`, 'EventsConsumer');
      }
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
      const foundEvent = await this.findEventByExternalId(event.externalId);
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

  /**
   * Common function to handle location creation and association
   * Used by both create and update operations
   * @param location - Location data
   * @returns Promise<string | undefined> - Location UID or undefined
   */
  private async handleLocationAndAssociation(location): Promise<string | undefined> {
    let locationUid = location?.uid;
    // Handle location creation if it's a new location
    if (!locationUid && location?.location) {
      const createdLocation = await this.createEventLocation(location);
      if (createdLocation) {
        locationUid = createdLocation.uid;
        // Create location association with the new location
        const associationData = {
          locationUid: locationUid,
          googlePlaceId: location.googlePlaceId,
          locationName: location.address,
          city: location.city,
          state: location.state,
          country: location.country,
          region: location.region,
        };
        await this.locationAssociationService.createLocationAssociation(associationData);
      }
    }
    
    return locationUid;
  }

  /**
   * Create event location using existing service
   * @param location - Location data containing location information
   * @returns Promise<PLEventLocation> - Created location record
   */
  private async createEventLocation(location): Promise<PLEventLocation | null> {
    try {
      return await this.plEventLocationsService.createPLEventLocation({
        location: location.location,
        timezone: location.timezone,
        country: location.country,
      });
    } catch (error) {
      this.logger.error(`Error creating event location: ${error.message}`, error.stack, 'EventsConsumer');
      throw error;
    }
  }

  /**
   * Common function to find event by externalId
   * Used by both update and delete operations
   * @param externalId - External ID of the event
   * @returns Promise<PLEvent> - Found event
   * @throws Error if event not found
   */
  private async findEventByExternalId(externalId: string): Promise<PLEvent | null> {
    const events = await this.plEventsService.getPLEvents({
      where: {
        externalId
      }
    });
    return events.length ? events[0] : null;
  }

  /**
  * Maps external event data to the database schema.
  * @param event - The event object received from the external service.
  * @returns Mapped event object ready for database insertion/update.
  */
  private async mapEventData(event) {
    const logo = await this.createLogo(event.event_logo);
    const resources: Array<{ 
      name: string; 
      description: string; 
      link: string;
    }> = [];
    if (event?.registration_link) {
      resources.push({
        name: "Registration", 
        description: "Registration URL",
        link: event.registration_link
      });
    }
    if (event?.website_link) {
      resources.push({
        name: "Website", 
        description: "Website URL",
        link: event.website_link
      });
    }
    return {
      externalId: event.event_id,
      name: event.event_name,
      description: event.description,
      websiteURL: event.website_link,
      isFeatured: event.is_featured,
      startDate: new Date(event.start_date),
      endDate: new Date(event.end_date),
      createdAt: event.createdAt,
      syncedAt: event.updatedAt,
      slugURL: event.event_id,
      locationUid: event.locationUid,
      logoUid: logo?.uid,
      resources,
      isDeleted: false,
    };
  }
      
  /**
   * Creates an image record in the database if a valid image URL is provided.
   * @param imageUrl - URL of the image.
   * @returns The created image record or null if no image URL is provided.
   */
  private async createLogo(imageUrl: string | null) {
    if (!imageUrl) return null;
    return await this.prisma.image.create({
      data: {
        cid: imageUrl,
        width: 150,
        height: 150,
        url: imageUrl,
        filename: getFilenameFromUrl(imageUrl),
        size: 500,
        type: getFileTypeFromUrl(imageUrl), // Get file type dynamically
        version: 'ORIGINAL',
        thumbnailToUid: null,
      }
    });
  }
} 
