import axios from 'axios';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { getFilenameFromUrl, getFileTypeFromUrl } from '../utils/helper/helper';
import { CacheService } from '../utils/cache/cache.service';
import { isEmpty } from 'lodash';
import { EventsService } from '../events/events.service';
import { PLEventStatus, PLEventType } from '@prisma/client';
import {IrlGatheringPushCandidatesService} from "./push/irl-gathering-push-candidates.service";
import { mapEventDetails, withEventDetails } from './pl-event-details.mapper';
import { mapEventColumns } from './pl-event-columns.mapper';
import { isLocalEventSubmitEnabled } from './pl-event-submit.constants';

/** Old events service status → LabOS status, for the events that wait or are drafts there. Rejected ones stay behind. */
const NON_APPROVED_IMPORT: ReadonlyArray<{ serviceStatus: string; status: PLEventStatus; key: 'pending' | 'draft' }> = [
  { serviceStatus: 'SUBMITTED', status: PLEventStatus.PENDING, key: 'pending' },
  { serviceStatus: 'PENDING', status: PLEventStatus.DRAFT, key: 'draft' },
];

export type NonApprovedImportCounts = { fetched: number; created: number; updated: number; skippedApproved: number };

export type NonApprovedImportResult =
  | { skipped: true; reason: string }
  | {
      pending: NonApprovedImportCounts;
      draft: NonApprovedImportCounts;
      /** Imported events whose creator email matches no LabOS member: they have no submitter. */
      withoutSubmitter: number;
    };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The events service's creator email (`created_by`, else `submitted_by`), lower-cased, or null. */
export function creatorEmailOf(event: { created_by?: unknown; submitted_by?: unknown }): string | null {
  for (const value of [event?.created_by, event?.submitted_by]) {
    if (typeof value === 'string' && EMAIL.test(value.trim())) return value.trim().toLowerCase();
  }
  return null;
}

@Injectable()
export class PLEventSyncService {
  private readonly logger = new Logger(PLEventSyncService.name);
  constructor(
    private readonly prisma: PrismaService,
    private cacheService: CacheService,
    private eventsService: EventsService,
    private readonly irlGatheringPushCandidatesService: IrlGatheringPushCandidatesService
  ) {}

  /**
   * Synchronizes events from an external service.
   * Fetches events, updates existing ones, creates new ones, and removes stale events.
   * @param body - Contains locationUid and authentication details.
   * @returns Acknowledgment of the sync process.
   */
  async syncEvents(body) {
    // After the cutover LabOS owns events: a pull from the events service must not change them.
    if (isLocalEventSubmitEnabled()) {
      this.logger.warn('Event sync skipped: EVENTS_LOCAL_SUBMIT_ENABLED is on.');
      return { skipped: true, reason: 'EVENTS_LOCAL_SUBMIT_ENABLED is on: LabOS owns events' };
    }
    try {
      const {selectedEventUids } = body;
      const events = await this.fetchEventsFromService(body);
      if (!events) return [];

      // pl-event-visibility: the sync matches its own events by externalId, whatever their status. Events a partner
      // app publishes (`sourceTeamUid`) carry the partner's own id, so they are never matched or deleted here.
      const existingEvents = await this.prisma.pLEvent.findMany({
        where: {
          AND:{
            externalId: { not: null },
            sourceTeamUid: null,
            isDeleted: false
          }
        },
        select: {
          uid: true,
          name: true,
          externalId: true,
          syncedAt: true,
          additionalInfo: true,
          status: true,
        },
      });

      const eventMap = new Map(existingEvents.map(event => [event.externalId, event]));

      const touchedEventUids: string[] = [];

      await this.createOrUpdateEvents(events, eventMap, touchedEventUids);

      if (isEmpty(selectedEventUids)) {
        await this.deleteStaleEvents(existingEvents, events, touchedEventUids);
      }

      if (touchedEventUids.length > 0) {
        await this.irlGatheringPushCandidatesService.refreshCandidatesForEvents(touchedEventUids);
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
   * Backfills `additionalInfo.details` and the typed columns (`mapEventColumns`) on events we already have.
   * It fetches the same APPROVED events as the full sync, matches them by `externalId`
   * and writes only those. It never creates or deletes an event and never touches
   * `slugURL`, name, dates or type (the full sync rewrites `slugURL` and skips events
   * whose `updatedAt` did not change, so it cannot be used for a backfill).
   * @returns how many events were updated.
   */
  async syncEventDetailsOnly(body): Promise<{ updated: number; skipped?: boolean; reason?: string }> {
    if (isLocalEventSubmitEnabled()) {
      this.logger.warn('Event details backfill skipped: EVENTS_LOCAL_SUBMIT_ENABLED is on.');
      return { updated: 0, skipped: true, reason: 'EVENTS_LOCAL_SUBMIT_ENABLED is on: LabOS owns events' };
    }
    try {
      const { selectedEventUids, timeoutMs } = body ?? {};
      const fetched = await this.fetchEventsFromService({ selectedEventUids, timeoutMs });
      if (!fetched) return { updated: 0 };
      // Only what was asked for, whatever the events service answers: one queue message must not rewrite every event.
      const events = isEmpty(selectedEventUids)
        ? fetched
        : fetched.filter((event) => selectedEventUids.includes(event.event_id));

      // pl-event-visibility: the backfill matches its own events by externalId, whatever their status.
      const existingEvents = await this.prisma.pLEvent.findMany({
        where: {
          externalId: { in: events.map((event) => event.event_id).filter(Boolean) },
          isDeleted: false,
        },
        select: { uid: true, externalId: true, additionalInfo: true },
      });
      const eventMap = new Map(existingEvents.map((event) => [event.externalId, event]));

      let updated = 0;
      for (const event of events) {
        const existingEvent = eventMap.get(event.event_id);
        if (!existingEvent) continue;
        await this.prisma.pLEvent.update({
          where: { uid: existingEvent.uid },
          data: {
            additionalInfo: withEventDetails(existingEvent.additionalInfo, this.detailsOf(event)),
            ...mapEventColumns(event),
          },
        });
        updated += 1;
      }

      this.cacheService.reset({ service: 'PLEventGuest' });
      this.logger.log(`Event details backfill completed: ${updated} of ${events.length} fetched events updated.`);
      return { updated };
    } catch (error) {
      this.logger.error('Error in event details backfill:', error);
      throw error;
    }
  }

  /** Event details from one events-service event; unreadable fields are logged and left empty. */
  private detailsOf(event) {
    return mapEventDetails(event, (field, reason) =>
      this.logger.warn(`Event ${event?.event_id}: details field "${field}" ignored (${reason}).`)
    );
  }

  /**
   * Brings the events that wait for review (old `SUBMITTED` → `PENDING`) and the drafts (old `PENDING` → `DRAFT`) over
   * from the events service before the cutover, so nothing a member submitted is left behind. Rejected events are not
   * moved. The submitter is the LabOS member whose email is the event's creator email; with no match the event has
   * no submitter. Writes no guest rows and sends no notifications: these events are not approved. An event LabOS
   * already has as approved is left as it is. Runs again safely: it updates what it brought over before.
   */
  async importNonApprovedEvents(): Promise<NonApprovedImportResult> {
    if (isLocalEventSubmitEnabled()) {
      this.logger.warn('Non-approved import skipped: EVENTS_LOCAL_SUBMIT_ENABLED is on.');
      return { skipped: true, reason: 'EVENTS_LOCAL_SUBMIT_ENABLED is on: LabOS owns events' };
    }
    const empty = (): NonApprovedImportCounts => ({ fetched: 0, created: 0, updated: 0, skippedApproved: 0 });
    const result = { pending: empty(), draft: empty(), withoutSubmitter: 0 };

    for (const { serviceStatus, status, key } of NON_APPROVED_IMPORT) {
      const events = ((await this.fetchEventsFromService({ status: serviceStatus })) ?? []).filter(
        (event) => event?.event_id && event?.event_name && event?.start_date && event?.end_date
      );
      result[key].fetched = events.length;
      if (!events.length) continue;

      // pl-event-visibility: matched by externalId whatever their status, partner events excluded.
      const existing = await this.prisma.pLEvent.findMany({
        where: {
          externalId: { in: events.map((event) => event.event_id) },
          sourceTeamUid: null,
          isDeleted: false,
        },
        select: { uid: true, externalId: true, additionalInfo: true, status: true },
      });
      const byExternalId = new Map(existing.map((event) => [event.externalId, event]));
      const submitterByEmail = await this.membersByEmail(events.map(creatorEmailOf));

      for (const event of events) {
        const stored = byExternalId.get(event.event_id);
        if (stored?.status === PLEventStatus.APPROVED) {
          result[key].skippedApproved += 1;
          continue;
        }
        if (event?.format != PLEventType.VIRTUAL) {
          event.locationUid = await this.gatheringFor(event);
        }
        const email = creatorEmailOf(event);
        const submitterUid = (email && submitterByEmail.get(email)) || null;
        if (!submitterUid) result.withoutSubmitter += 1;
        const data = { ...(await this.mapEventData(event, stored?.additionalInfo)), status, submitterUid };
        if (stored) {
          await this.prisma.pLEvent.update({ where: { uid: stored.uid }, data });
          result[key].updated += 1;
        } else {
          await this.prisma.pLEvent.create({ data });
          result[key].created += 1;
        }
      }
    }

    this.cacheService.reset({ service: 'PLEventGuest' });
    this.logger.log(`Non-approved import completed: ${JSON.stringify(result)}`);
    return result;
  }

  /** Lower-cased email → member uid, for the emails given. */
  private async membersByEmail(emails: Array<string | null>): Promise<Map<string, string>> {
    const wanted = Array.from(new Set(emails.filter((email): email is string => !!email)));
    if (!wanted.length) return new Map();
    const members = await this.prisma.member.findMany({
      where: { OR: wanted.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })) },
      select: { uid: true, email: true },
    });
    const pairs: Array<[string, string]> = [];
    for (const member of members) if (member.email) pairs.push([member.email.toLowerCase(), member.uid]);
    return new Map(pairs);
  }

  /** The event's gathering, as the pull sync finds it. A draft's address may be incomplete: then it has none. */
  private async gatheringFor(event): Promise<string | null> {
    try {
      const location = await this.eventsService.createEventLocation(event);
      return location?.uid ?? null;
    } catch (error) {
      this.logger.warn(`Event ${event?.event_id}: no gathering (${error?.message}).`);
      return null;
    }
  }

  /**
   * Fetches events from an external service.
   * @param params - Includes locationUid and clientSecret for authentication.
   * @returns List of events or null if no events are found.
   */
  private async fetchEventsFromService(params) {
    try {
      const { selectedEventUids, timeoutMs, status = 'APPROVED' } = params;
      const queryParams = new URLSearchParams({
        status,
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
          },
          ...(timeoutMs ? { timeout: timeoutMs } : {}),
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
  private async createOrUpdateEvents(events, eventMap, touchedEventUids: string[]) {
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
            data: await this.mapEventData(event, existingEvent.additionalInfo),
          });

          touchedEventUids.push(existingEvent.uid);

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

        touchedEventUids.push(createdEvent.uid);

        this.logger.log(`Created new event: "${createdEvent.name}" (ID: ${createdEvent.externalId}).`);
      }
    }
  }

  /**
   * Deletes stale events from the database that are no longer present in the external service.
   * @param existingEvents - List of currently stored events.
   * @param events - List of fetched events from the external service.
   */
  private async deleteStaleEvents(existingEvents, events, touchedEventUids: string[]) {
    const eventIds = events.map(event => event.event_id);
    // Approved events that the events service no longer lists as approved. Waiting and draft events brought over by
    // `importNonApprovedEvents` are not in that list by nature, so they are left alone.
    const eventsToDelete = existingEvents.filter(
      e => e.status === PLEventStatus.APPROVED && !eventIds.includes(e.externalId)
    );
    if (eventsToDelete.length) {
      this.logger.log(`Events to be deleted: ${eventsToDelete.map(e => `${e.name} (ID: ${e.externalId})`).join(', ')}`);
      await this.prisma.pLEvent.updateMany({
        where: { uid: { in: eventsToDelete.map(e => e.uid) } },
        data: { isDeleted: true }
      });

      touchedEventUids.push(...eventsToDelete.map(e => e.uid));

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
  private async mapEventData(event, existingAdditionalInfo?) {
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
      additionalInfo: withEventDetails(existingAdditionalInfo, this.detailsOf(event)),
      ...mapEventColumns(event),
      // The pull sync reads approved events only, so an event that waited or was a draft becomes approved here.
      status: PLEventStatus.APPROVED,
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
