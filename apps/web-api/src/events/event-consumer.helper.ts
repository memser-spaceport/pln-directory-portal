import { Injectable } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { PrismaService } from '../shared/prisma.service';
import { PLEventLocationAssociationService } from '../pl-events/pl-event-location-association.service';
import { PLEventLocationsService } from '../pl-events/pl-event-locations.service';
import { getFilenameFromUrl, getFileTypeFromUrl } from '../utils/helper/helper';
import { PLEvent, PLEventLocation, PLEventType, PLEventLocationAssociation } from '@prisma/client';

@Injectable()
export class EventConsumerHelper {
  constructor(
    private logger: LogService,
    private plEventsService: PLEventsService,
    private prisma: PrismaService,
    private locationAssociationService: PLEventLocationAssociationService,
    private plEventLocationsService: PLEventLocationsService
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
}
