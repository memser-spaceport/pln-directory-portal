import { Injectable } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { PrismaService } from '../shared/prisma.service';
import { PLEventLocationAssociationService } from '../pl-events/pl-event-location-association.service';
import { PLEventLocationsService } from '../pl-events/pl-event-locations.service';
import { PLEventAssociationService } from '../pl-events/pl-event-association.service';
import { EventGuestSyncHelper, ProcessedAssociation } from './event-guests-sync.helper';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { getFilenameFromUrl, getFileTypeFromUrl } from '../utils/helper/helper';
import { PLEvent, PLEventLocation, PLEventType, PLEventLocationAssociation } from '@prisma/client';
import { CacheService } from '../utils/cache/cache.service';
import { 
  PLEventAssociationInputSchema, 
  PLEventAssociationInput,
  AssociationRole 
} from '@protocol-labs-network/contracts';

@Injectable()
export class EventConsumerHelper {
  constructor(
    private logger: LogService,
    private plEventsService: PLEventsService,
    private prisma: PrismaService,
    private locationAssociationService: PLEventLocationAssociationService,
    private plEventLocationsService: PLEventLocationsService,
    private plEventAssociationService: PLEventAssociationService,
    private eventGuestSyncHelper: EventGuestSyncHelper,
    private membersService: MembersService,
    private teamsService: TeamsService,
    private cacheService: CacheService,
  ) {}

  /**
   * Common function to handle location creation and association
   * Used by both create and update operations
   * @param location - Location data
   * @param tx - Optional transaction object
   * @returns Promise<{ locationUid?: string; associationUid?: string }>
   */
  async handleLocationAndAssociation(
    location,
    tx?: any
  ): Promise<{
    locationUid?: string; 
    associationUid?: string 
  }> {
    const locationUid = location?.uid;
    let associationUid: string | undefined;
    // Common filters for city/state/country
    const locationCriteria = {
      city: location.city ?? null,
      state: location.state ?? null,
      country: location.country ?? null,
    };
    if (location.isInferred) {
      // Use existing association for inferred locations (most recent, not deleted)
      const existingAssociation = await this.locationAssociationService.findAssociation(
        {
          where: { ...locationCriteria, locationUid, isDeleted: false },
          orderBy: { createdAt: 'desc' },
          select: { uid: true },
        },
        tx
      );
      associationUid = existingAssociation?.uid;
    } else {
      const association = await this.locationAssociationService.findAssociation(
        {
          where: { ...locationCriteria, isDeleted: false },
          orderBy: { createdAt: 'desc' },
          select: { uid: true },
        },
        tx
      );
      if (association?.uid && locationUid) {
        // Update existing association with new location uid
        await this.locationAssociationService.updatePLEventLocationAssociation(
          association.uid,
          { locationUid },
          tx
        );
        associationUid = association.uid;
      } else {
        // Create a new association
        const newAssociation = await this.locationAssociationService.createLocationAssociation(
          {
            locationUid,
            googlePlaceId: location.googlePlaceId as unknown as string,
            locationName: location.address as unknown as string,
            city: location.city,
            state: location.state,
            country: location.country,
            region: location.region,
          },
          tx
        );
        associationUid = newAssociation.uid;
      }
    }
    this.cacheService.reset({ service: 'PLEventGuest' });
    return { locationUid, associationUid };
  }

  /**
   * Create event location using existing service
   * @param location - Location data containing location information
   * @param tx - Optional transaction object
   * @returns Promise<PLEventLocation> - Created location record
   */
  async createEventLocation(location, tx?: any): Promise<PLEventLocation | null> {
    try {
      return await this.plEventLocationsService.createPLEventLocation({
        location: location.location,
        timezone: location.timezone,
        country: location.country,
      }, tx);
    } catch (error) {
      this.logger.error(`Error creating event location: ${error.message}`, error.stack, 'EventConsumerHelper');
      throw error;
    }
  }

  /**
   * Soft-delete existing matching associations and create a new one, returning its uid.
   * Performs operations in a single transaction for consistency.
   * @param association - Association data.
   * @param tx - The transaction object.
   */
  async createAssociation(association, tx?: any): Promise<PLEventLocationAssociation> { 
    return await this.locationAssociationService.createLocationAssociation(association, tx);
  }

  /**
   * Soft-delete existing matching associations.
   * @param association - Association data.
   * @param tx - The transaction object.
   */
  async softDeleteAssociations(association, tx?: any): Promise<void> {
    await this.locationAssociationService.updateAssociations({
      where: {
        city: association.city ?? null,
        state: association.state ?? null,
        country: association.country ?? null,
      },
      data: { isDeleted: true }
    }, tx);
  }

  /**
   * Common function to find event by externalId
   * Used by both update and delete operations
   * @param externalId - External ID of the event
   * @returns Promise<PLEvent> - Found event
   * @throws Error if event not found
   */
  async findEventByExternalId(externalId: string, tx?): Promise<PLEvent | null> {
    const events = await this.plEventsService.getPLEvents({
      where: {
        externalId
      }
    }, tx);
    return events.length ? events[0] : null;
  }

  /**
   * Syncs an event to the database (create or update).
   * 
   * This method handles the core event upsert logic:
   * - If event exists (by externalId), updates it
   * - If event doesn't exist, creates a new one
   * 
   * @param event - Mapped event data from events-service
   * @param locationUid - Location UID (null for virtual events)
   * @param associationUid - Location association UID
   * @param locationStatus - Location mapping status (AUTO_MAPPED or MANUALLY_MAPPED)
   * @param tx - Transaction client
   * @returns The event UID (existing or newly created)
   */
  async syncEvent(
    event: any,
    locationUid: string | null,
    associationUid: string | null,
    locationStatus: string,
    tx: any
  ): Promise<string> {
    const existingEvent = await this.findEventByExternalId(event.externalId, tx);
    
    const eventData = {
      ...event,
      locationStatus,
      locationUid,
      pLEventLocationAssociationUid: associationUid
    };

    if (existingEvent) {
      // Update existing event
      await this.plEventsService.updateEventByUid(existingEvent.uid, eventData, tx);
      this.logger.info(`[SyncEvent] Updated event uid=${existingEvent.uid}`, 'EventConsumerHelper');
      return existingEvent.uid;
    } else {
      // Create new event
      const createdEvent = await this.plEventsService.createPLEvent(eventData, tx);
      this.logger.info(`[SyncEvent] Created event uid=${createdEvent.uid} externalId=${event.externalId}`, 'EventConsumerHelper');
      return createdEvent.uid;
    }
  }

  /**
  * Maps external event data to the database schema.
  * @param event - The event object received from the external service.
  * @param tx - The transaction object. 
  * @returns Mapped event object ready for database insertion/update.
  */
  async mapEventData(event, tx?) {
    const logo = await this.createLogo(event.event_logo, tx);
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
      type: event.format === PLEventType.VIRTUAL ? PLEventType.VIRTUAL: PLEventType.IN_PERSON,
      isDeleted: false,
      associations: event.associations,
    };
  }

  /**
   * Creates an image record in the database if a valid image URL is provided.
   * @param imageUrl - URL of the image.
   * @param tx - The transaction object.
   * @returns The created image record or null if no image URL is provided.
   */
  async createLogo(imageUrl: string | null, tx?) {
    if (!imageUrl) return null;
    return await (tx || this.prisma).image.create({
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
  

  /**
   * Sync event associations from events-service to PLEventAssociation table.
   * 
   * Processing is done in parallel for better performance. Each association
   * is processed independently - failure of one doesn't affect others.
   * 
   * After all associations are processed, old associations (not in the new list)
   * are deleted from the database.
   * 
   * @param eventUid - UID of the PLEvent in directory
   * @param externalEventId - event_id from events-service
   * @param associations - Array of associations from events-service
   * @param tx - Optional transaction object
   * @returns Array of processed associations (for guest sync)
   */
  async syncEventAssociations(
    eventUid: string,
    externalEventId: string,
    associations: PLEventAssociationInput[],
    tx?: any
  ): Promise<ProcessedAssociation[]> {
    if (!associations?.length) {
      this.logger.info(`No associations to sync for event ${externalEventId}`, 'EventConsumerHelper');
      return [];
    }
    // Process all associations in parallel
    const results = await Promise.allSettled(
      associations.map(association => 
        this.processAssociation(association, eventUid, externalEventId, tx)
      )
    );
    // Collect processed associations and IDs
    const processedAssociations: ProcessedAssociation[] = [];
    const processedIds: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        processedAssociations.push(result.value);
        processedIds.push(result.value._id);
      } else if (result.status === 'rejected') {
        const associationId = associations[index]?._id || 'unknown';
        this.logger.error(
          `Failed to process association ${associationId} for event ${externalEventId}: ${result.reason?.message || 'Unknown error'}`,
          result.reason?.stack,
          'EventConsumerHelper'
        );
      }
    });
    // Delete associations that are no longer in the events-service
    if (processedIds.length > 0) {
      await this.plEventAssociationService.deleteMany(
        {
          eventUid,
          externalAssociationId: { notIn: processedIds },
        },
        tx
      );
    }
    this.logger.info(
      `Synced ${processedIds.length}/${associations.length} associations for event ${externalEventId}`,
      'EventConsumerHelper'
    );
    return processedAssociations;
  }

  /**
   * Validates an association - schema and entity existence.
   * 
   * Checks:
   * 1. Schema validation using Zod
   * 2. Entity (member/team) exists in database
   * 
   * @param association - Raw association data from events-service
   * @param externalEventId - Event ID for logging context
   * @returns True if both validations pass, false otherwise (logs error)
   */
  private async validateAssociation(
    association: PLEventAssociationInput,
    externalEventId: string
  ): Promise<boolean> {
    // Step 1: Validate schema
    const result = PLEventAssociationInputSchema.safeParse(association);
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      this.logger.error(
        `[ValidateAssociation] Invalid schema for event ${externalEventId}: ${errors}`,
        undefined,
        'EventConsumerHelper'
      );
      return false;
    }
    // Step 2: Validate entity exists
    const { entityType, entityUid } = association;
    try {
      if (entityType === 'MEMBER') {
        const member = await this.membersService.findUnique({ uid: entityUid });
        if (!member) {
          this.logger.error(
            `[ValidateAssociation] Member ${entityUid} not found for event ${externalEventId}`,
            undefined,
            'EventConsumerHelper'
          );
          return false;
        }
      } else {
        await this.teamsService.findTeamByUid(entityUid);
      }
    } catch {
      this.logger.error(
        `[ValidateAssociation] ${entityType} ${entityUid} not found for event ${externalEventId}`,
        undefined,
        'EventConsumerHelper'
      );
      return false;
    }

    return true;
  }

  /**
   * Processes a single association - validates and upserts to database.
   * Does NOT sync guest (that's handled separately via syncEventGuests).
   * 
   * Flow:
   * 1. Validate association schema using Zod
   * 2. Validate entity (member/team) exists in database
   * 3. Upsert association to PLEventAssociation table
   * 
   * @param association - Raw association data from events-service
   * @param eventUid - PLEvent UID in directory
   * @param externalEventId - External event ID from events-service
   * @param tx - Optional transaction client
   * @returns Processed association info if successful, null otherwise
   */
  private async processAssociation(
    association: PLEventAssociationInput,
    eventUid: string,
    externalEventId: string,
    tx?: any
  ): Promise<ProcessedAssociation | null> {
    // Validate association (schema + entity exists)
    if (!await this.validateAssociation(association, externalEventId)) {
      return null;
    }
    const { _id, role, entityType, entityUid, entityDetails } = association;
    const logContext = `[Association ${_id}] event=${externalEventId}`;
    // Upsert association to PLEventAssociation
    const associationData = {
      eventUid,
      entityType: this.plEventAssociationService.mapEntityType(entityType),
      memberUid: entityType === 'MEMBER' ? entityUid : null,
      teamUid: entityType === 'TEAM' ? entityUid : null,
      role: this.plEventAssociationService.mapRole(role),
    };
    await this.plEventAssociationService.upsertByExternalIds(
      externalEventId,
      _id,
      { ...associationData, externalEventId, externalAssociationId: _id },
      associationData,
      tx
    );
    this.logger.info(`${logContext} - Association synced successfully`, 'EventConsumerHelper');
    return {
      _id,
      entityType,
      entityUid,
      role: role as AssociationRole
    };
  }
}
