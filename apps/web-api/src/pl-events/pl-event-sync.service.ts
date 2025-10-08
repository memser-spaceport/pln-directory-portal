import axios from 'axios';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { getFilenameFromUrl, getFileTypeFromUrl } from '../utils/helper/helper';
import { CacheService } from '../utils/cache/cache.service';
import { isEmpty } from 'lodash';
import { EventsService } from '../events/events.service';
import { PLEventType } from '@prisma/client';

@Injectable()
export class PLEventSyncService {
  private readonly logger = new Logger(PLEventSyncService.name);
  constructor(
    private readonly prisma: PrismaService,
    private cacheService: CacheService,
    private eventsService: EventsService
  ) {}

  /**
   * Synchronizes events from an external service.
   * Fetches events, updates existing ones, creates new ones, and removes stale events.
   * @param body - Contains locationUid and authentication details.
   * @returns Acknowledgment of the sync process.
   */
  async syncEvents(body) {
    try {
      const {selectedEventUids } = body;
      const events = await this.fetchEventsFromService(body);
      if (!events) return [];
      const existingEvents = await this.prisma.pLEvent.findMany({
        where: {
          AND:{
            externalId: { not: null },
            isDeleted: false
          }
        },
        select: {
          uid: true,
          name: true,
          externalId: true,
          syncedAt: true
        },
      });
      // Create a mapping of existing events for quick lookup
      const eventMap = new Map(existingEvents.map(event => [event.externalId, event]));
      // Insert or update events based on fetched data
      await this.createOrUpdateEvents(events, eventMap);
      // Remove events that no longer exist in the external source
      if (isEmpty(selectedEventUids)) {
        await this.deleteStaleEvents(existingEvents, events);
      }
      this.cacheService.reset({ service: 'PLEventGuest' });
      this.logger.log('Event sync process completed successfully.');
      return events;
    } catch (error) {
      this.logger.error('Error in event sync process:', error);
      throw error;
    }
  }

  /**
   * Fetches events from an external service.
   * @param params - Includes locationUid and clientSecret for authentication.
   * @returns List of events or null if no events are found.
   */
  private async fetchEventsFromService(params) {
    try {
      const { selectedEventUids } = params;
      const queryParams = new URLSearchParams({
        status: 'APPROVED',
        conference: ""
      });
  
      if (selectedEventUids && selectedEventUids.length > 0) {
        selectedEventUids.forEach(name => queryParams.append('event_id', name));
      }
      const response = await axios.get(
        `${process.env.EVENT_SERVICE_URL}/events?${queryParams.toString()}`,
        {
          headers: {
            'origin': process.env.IRL_DOMAIN,
          }
        }
      );
      if (!response.data || !response.data.events) {
        this.logger.log('No events received from event service.');
        return null;
      }
      return response.data.events;
    } catch (error) {
      this.logger.error('Error fetching events from event service:', error.message);
      throw new InternalServerErrorException('Error fetching events from event service', error);
    }
  }

  /**
   * Creates new events or updates existing ones in the database.
   * Compares timestamps to determine if an update is needed.
   * @param events - List of fetched events from the external source.
   * @param eventMap - Map of existing events stored in the database.
   * @param locationUid - Unique identifier for the location.
   */
  private async createOrUpdateEvents(events, eventMap) {
    for (const event of events) {
      const existingEvent = eventMap.get(event.event_id);
      if (existingEvent) {
        // Compare update timestamps to determine if an update is needed
        const updatedAt = new Date(event.updatedAt);
        const existingEventUpdatedAt = new Date(existingEvent.syncedAt);
        if (updatedAt > existingEventUpdatedAt) {
          if (event?.format != PLEventType.VIRTUAL) {
            const location = await this.eventsService.createEventLocation(event);
            event.locationUid = location?.uid;
          }
          await this.prisma.pLEvent.update({
            where: { uid: existingEvent.uid },
            data: await this.mapEventData(event),
          });
          this.logger.log(`Updated event: "${event.event_name}" (ID: ${event.event_id}).`);
        } else {
          this.logger.log(`No update needed for event: "${event.event_name}" (ID: ${event.event_id}), already up to date.`);
        }
      } else {
        if (event?.format != PLEventType.VIRTUAL) {
        const location = await this.eventsService.createEventLocation(event);
          // Create a new event if it does not exist in the database
          event.locationUid = location?.uid;
        }
        const createdEvent = await this.prisma.pLEvent.create({
          data: await this.mapEventData(event)
        });
        this.logger.log(`Created new event: "${createdEvent.name}" (ID: ${createdEvent.externalId}).`);
      }
    }
  }

  /**
   * Deletes stale events from the database that are no longer present in the external service.
   * @param existingEvents - List of currently stored events.
   * @param events - List of fetched events from the external service.
   */
  private async deleteStaleEvents(existingEvents, events) {
    const eventIds = events.map(event => event.event_id);
    // Identify events that are in the database but not in the fetched list
    const eventsToDelete = existingEvents.filter(e => !eventIds.includes(e.externalId));
    if (eventsToDelete.length) {
      this.logger.log(`Events to be deleted: ${eventsToDelete.map(e => `${e.name} (ID: ${e.externalId})`).join(', ')}`);
      await this.prisma.pLEvent.updateMany({
        where: { uid: { in: eventsToDelete.map(e => e.uid) } },
        data: {
          isDeleted: true
        }
      });
      this.logger.log(`Deleted ${eventsToDelete?.length} events from the database.`);
    } else {
      this.logger.log("No stale events to delete.");
    }
  }

  /**
   * Maps external event data to the database schema.
   * @param event - The event object received from the external service.
   * @param locationUid - Unique identifier for the location.
   * @returns Mapped event object ready for database insertion/update.
   */
  private async mapEventData(event) {
    const logo = await this.createLogo(this.prisma, event.event_logo);
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
      slugURL: `${event.event_name.substring(0, 4)}-${event.event_id}`,
      locationUid: event.locationUid,
      logoUid: logo?.uid,
      resources,
      isDeleted: false,
    };
  }

  /**
   * Creates an image record in the database if a valid image URL is provided.
   * @param prisma - Prisma client instance.
   * @param imageUrl - URL of the image.
   * @returns The created image record or null if no image URL is provided.
   */
  async createLogo(prisma, imageUrl: string | null) {
    if (!imageUrl) return null;
    return await prisma.image.create({
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
