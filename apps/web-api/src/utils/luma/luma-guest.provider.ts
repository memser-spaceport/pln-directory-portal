import { Injectable, Logger } from '@nestjs/common';
import { ExternalEventProvider } from '@prisma/client';
import { LumaApiService, LumaGuest } from './luma-api.service';
import { 
  IGuestProvider, 
  ExternalGuest,
  GuestFetchOptions,
} from '../../pl-events/pl-event-guest-sync/pl-event-guest-sync.interface';

/**
 * LUMA provider for fetching event guests
 * Implements IGuestProvider interface for the guest sync system
 */
@Injectable()
export class LumaGuestProvider implements IGuestProvider {
  private readonly logger = new Logger(LumaGuestProvider.name);
  readonly providerType = ExternalEventProvider.LUMA;

  constructor(private readonly lumaApi: LumaApiService) {}

  /**
   * Fetches guests from LUMA in batches and processes each batch
   * @param onBatchReceived - Callback invoked for each batch of guests
   * @param options - eventId (required), status filter
   * @returns Total number of guests fetched
   */
  async fetchGuestsInBatches(
    onBatchReceived: (guests: ExternalGuest[]) => Promise<void>,
    options: GuestFetchOptions
  ): Promise<number> {
    this.logger.log(`Fetching guests for LUMA event: ${options.eventId}`);

    return this.lumaApi.fetchGuestsInBatches(
      async (lumaGuests) => {
        const guests = this.normalizeGuests(lumaGuests);
        await onBatchReceived(guests);
      },
      { eventId: options.eventId, status: options.status }
    );
  }

  /**
   * Converts LumaGuest to ExternalGuest format
   */
  private normalizeGuests(lumaGuests: LumaGuest[]): ExternalGuest[] {
    return lumaGuests.map(guest => ({
      externalGuestId: guest.id,
      email: guest.email,
      name: guest.name,
      registeredAt: guest.registeredAt,
      metadata: {
        approvalStatus: guest.approvalStatus,
      },
    }));
  }

  isConfigured(): boolean {
    return this.lumaApi.isConfigured();
  }
}
