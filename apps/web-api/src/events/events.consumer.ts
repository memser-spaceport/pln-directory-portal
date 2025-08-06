import { Injectable } from '@nestjs/common';
import { SqsMessageHandler } from '@ssut/nestjs-sqs';
import { LogService } from '../shared/log.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { PLEventLocationAssociationService } from '../pl-events/pl-event-location-association.service';
import { PLEventLocationsService } from '../pl-events/pl-event-locations.service';
import { PrismaService } from '../shared/prisma.service';
import { getFilenameFromUrl, getFileTypeFromUrl } from '../utils/helper/helper';
import { PLEventLocation, PLEventLocationAssociation, PLEvent } from '@prisma/client';
import { CREATE, UPDATE, DELETE } from '../utils/constants';

export type EventOperationType = 'CREATE' | 'UPDATE' | 'DELETE';

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
      const { type, event, location } = payload;
      const formattedEvent = await this.mapEventData(event);
      
      switch (type) {
        case CREATE:
          await this.handleEventCreation(formattedEvent, { ...location, ...event.address_info });
          break;
        case UPDATE:
          await this.handleEventUpdate(formattedEvent, { ...location, ...event.address_info });
          break;
        case DELETE:
          await this.handleEventDeletion(formattedEvent);
          break;
        default:
          this.logger.error(`Unsupported event operation type: ${type}`, 'EventsConsumer');
          break;
      }
      
      this.logger.info(`Successfully processed event operation message: ${message.MessageId}`, 'EventsConsumer');
    } catch (error) {
      this.logger.error(`Error processing event operation message ${message.MessageId}: ${error.message}`, error.stack, 'EventsConsumer');
      throw error; // Re-throw to trigger SQS retry mechanism
    }
  }

  /**
   * Handle event creation operation
   * Creates location (if new), association, and then the event
   * @param event - Event data to create
   * @param location - Location data
   */
  private async handleEventCreation(
    event, 
    location
  ): Promise<void> {
    try {
      this.logger.info('Creating new event', 'EventsConsumer');
      // Handle location creation and association
      const locationUid = await this.handleLocationAndAssociation(location);
      // Create the event with updated locationUid
      await this.plEventsService.createPLEvent({ ...event, locationUid: locationUid });
      this.logger.info('Successfully created event', 'EventsConsumer');
    } catch (error) {
      this.logger.error(`Error handling event creation: ${error.message}`, error.stack, 'EventsConsumer');
      throw error;
    }
  }

  /**
   * Handle event update operation
   * Updates existing event and optionally handles location changes
   * @param event - Updated event data
   * @param location - Location data
   */
  private async handleEventUpdate(
    event, 
    location
  ): Promise<void> {
    try {
      this.logger.info(`Updating event: ${event.externalId}`, 'EventsConsumer');
      // Handle location creation and association
      const locationUid = await this.handleLocationAndAssociation(location);
      const foundEvent = await this.findEventByExternalId(event.externalId);
      await this.plEventsService.updateEventByUid(foundEvent?.uid, {
        ...event,
        locationUid: locationUid
      });
      this.logger.info(`Successfully updated event with externalId: ${event.externalId}`, 'EventsConsumer');
    } catch (error) {
      this.logger.error(`Error handling event update: ${error.message}`, error.stack, 'EventsConsumer');
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
      await this.plEventsService.deleteEventByUid(foundEvent?.uid);
      this.logger.info(`Successfully deleted event: ${event.externalId}`, 'EventsConsumer');
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
    if (!locationUid) {
      const createdLocation = await this.createEventLocation(location);
      if (createdLocation) {
        locationUid = createdLocation.uid;
        // Create location association with the new location
        const associationData = {
          locationUid: locationUid,
          googlePlaceId: location.googlePlaceId,
          locationName: location.location,
          city: location.city,
          state: location.state,
          country: location.country,
          region: location.region,
          type: location.type
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
        type: location.type,
      });
    } catch (error) {
      this.logger.error(`Error creating event location: ${error.message}`, error.stack, 'EventsConsumer');
      throw error;
    }
  }

  /**
   * Create location association for the newly created location
   * @param location - Location data from the payload
   * @returns Promise<PLEventLocationAssociation> - Created association record
   */
  private async createEventLocationAssociation(location: any): Promise<PLEventLocationAssociation> {
    try {
      const associationData = {
        locationUid: location.uid,
        googlePlaceId: location.googlePlaceId,
        locationName: location.location,
        city: location.city,
        state: location.state,
        country: location.country,
        region: location.region,
        type: location.type
      };
      const createdAssociation = await this.locationAssociationService.createLocationAssociation(associationData);
      this.logger.info(`Created location association for location: ${location.uid}`, 'EventsConsumer');
      return createdAssociation;
    } catch (error) {
      this.logger.error(`Error creating location association: ${error.message}`, error.stack, 'EventsConsumer');
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
  private async findEventByExternalId(externalId: string): Promise<PLEvent> {
    const events = await this.plEventsService.getPLEvents({
      where: {
        externalId: externalId
      }
    });
    if (!events.length) {
      throw new Error(`Event not found with externalId: ${externalId}`);
    }
    return events[0];
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
  async createLogo(imageUrl: string | null) {
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