import axios from 'axios';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class PLEventSyncService {
  private readonly logger = new Logger(PLEventSyncService.name);
  constructor(
    private readonly prisma: PrismaService
  ) {}

  /**
   * Synchronizes events from an external service.
   * Fetches events, updates existing ones, creates new ones, and removes stale events.
   * @param body - Contains locationUid and authentication details.
   * @returns Acknowledgment of the sync process.
   */
  async syncEvents(body) {
    try {
      const { locationUid } = body;
      const events = await this.fetchEventsFromService(body);
      if (!events) return [];
      const existingEvents = await this.prisma.pLEvent.findMany({
        where: { 
          externalId: { not: null } 
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
      await this.createOrUpdateEvents(events, eventMap, locationUid);
      // Remove events that no longer exist in the external source
      await this.deleteStaleEvents(existingEvents, events);
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
      const { clientSecret, conference } = params; 
      const response = await axios.get(
        `${process.env.EVENT_SERVICE_URL}/events?status=APPROVED&conference=${conference}`, 
        {
          headers: {
            'x-client-secret': clientSecret,
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
  private async createOrUpdateEvents(events, eventMap, locationUid) {
    for (const event of events) {
      const existingEvent = eventMap.get(event.event_id);
      if (existingEvent) {
        // Compare update timestamps to determine if an update is needed
        const updatedAt = new Date(event.updatedAt);
        const existingEventUpdatedAt = new Date(existingEvent.syncedAt);
        if (updatedAt > existingEventUpdatedAt) {
          await this.prisma.pLEvent.update({
            where: { uid: existingEvent.uid },
            data: this.mapEventData(event, locationUid),
          });
          this.logger.log(`Updated event: "${event.event_name}" (ID: ${event.event_id}).`);
        } else {
          this.logger.log(`No update needed for event: "${event.event_name}" (ID: ${event.event_id}), already up to date.`);
        }
      } else {
        // Create a new event if it does not exist in the database
        const createdEvent = await this.prisma.pLEvent.create({ data: this.mapEventData(event, locationUid) });
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
      await this.prisma.pLEvent.deleteMany({
        where: { uid: { in: eventsToDelete.map(e => e.uid) } },
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
  private mapEventData(event, locationUid) {
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
      locationUid
    };
  }
}
