import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { GuestProviderFactory } from './providers/guest-provider.factory';
import { PLEventGuestMatchingService } from './pl-event-guest-matching.service';
import { IrlGatheringPushCandidatesService } from '../push/irl-gathering-push-candidates.service';
import {
  PLEventGuestSyncMessage,
  PLEventGuestSyncResult,
  ExternalGuest,
  MatchedGuest,
} from './pl-event-guest-sync.interface';

/**
 * Orchestrates PLEvent guest synchronization
 * 
 * Flow (per page):
 * 1. Fetch page of guests from external provider (50 guests default)
 * 2. Match guests with directory members by email
 * 3. Create PLEventGuest entries for matches
 * 4. Repeat until all pages processed
 * 5. Update sync timestamp and refresh push notifications
 */
@Injectable()
export class PLEventGuestSyncService {
  private readonly logger = new Logger(PLEventGuestSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: GuestProviderFactory,
    private readonly matchingService: PLEventGuestMatchingService,
    private readonly pushCandidatesService: IrlGatheringPushCandidatesService,
  ) {}

  /**
   * Processes guest sync for an event - fetches and processes page by page
   */
  async processEvent(message: PLEventGuestSyncMessage): Promise<PLEventGuestSyncResult> {
    const { eventUid, externalEventId, locationUid, providerType } = message;
    const log = (msg: string) => this.logger.log(`[Sync:${eventUid}] ${msg}`);
    log(`Starting sync (provider: ${providerType})`);
    const result: PLEventGuestSyncResult = {
      eventUid,
      providerType,
      totalNoOfGuests: 0,
      processed: 0,
    };
    try {
      const provider = this.providerFactory.getProvider(providerType);
      // Process guests page by page (50 per page from LUMA)
      result.totalNoOfGuests = await provider.fetchGuestsInBatches(
        async (guests) => {
          const processed = await this.processGuests(eventUid, locationUid, guests);
          result.processed += processed;
          log(`Processed page: ${processed}/${guests.length} guests created`);
        },
        { 
          status: 'approved',
          eventId: externalEventId 
        }
      );
      // Update sync timestamp
      await this.prisma.pLEvent.update({
        where: { uid: eventUid },
        data: { guestLastSyncedAt: new Date() },
      });
      // Refresh push notifications
      await this.pushCandidatesService.refreshCandidatesForEventsAndUpdateNotifications([eventUid]);
      log(`Complete: ${result.processed}/${result.totalNoOfGuests} guests processed`);
      return result;
    } catch (error) {
      this.logger.error(`[Sync:${eventUid}] Failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Processes a single batch of guests: match → create entries
   * @returns Number of new guests created
   */
  private async processGuests(
    eventUid: string,
    locationUid: string,
    guests: ExternalGuest[]
  ): Promise<number> {
    const matched = await this.matchingService.matchGuests(guests);
    if (matched.length === 0) return 0;
    return this.createGuestEntries(eventUid, locationUid, matched);
  }

  /**
   * Creates PLEventGuest entries, skipping duplicates
   * @returns Number of new entries created
   */
  private async createGuestEntries(
    eventUid: string,
    locationUid: string,
    matchedGuests: MatchedGuest[]
  ): Promise<number> {
    // Check existing to skip duplicates
    const existingGuests = await this.prisma.pLEventGuest.findMany({
      where: {
        eventUid,
        locationUid,
        memberUid: { in: matchedGuests.map(g => g.memberUid) },
      },
      select: { memberUid: true },
    });
    const existingSet = new Set(existingGuests.map(guest => guest.memberUid));
    const newGuests = matchedGuests.filter(guest => !existingSet.has(guest.memberUid));
    if (newGuests.length === 0) {
      return 0;
    }
    await this.prisma.pLEventGuest.createMany({
      data: newGuests.map(guest => ({
        eventUid,
        locationUid,
        memberUid: guest.memberUid,
        teamUid: guest.teamUid,
        externalGuestId: guest.externalGuest.externalGuestId,
        isHost: false,
        isSpeaker: false,
        isSponsor: false,
        isFeatured: false,
      })),
      skipDuplicates: true,
    });
    return newGuests.length;
  }
}
