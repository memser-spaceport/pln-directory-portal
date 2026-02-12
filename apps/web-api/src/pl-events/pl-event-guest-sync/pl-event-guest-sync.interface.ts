import { ExternalEventProvider } from '@prisma/client';

export { ExternalEventProvider };

/**
 * Normalized guest data from external providers
 */
export interface ExternalGuest {
  externalGuestId: string;
  email: string;
  name?: string;
  status?: string;
  registeredAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * SQS message payload for guest sync
 */
export interface PLEventGuestSyncMessage {
  eventUid: string;
  externalEventId: string;
  locationUid: string;
  providerType: ExternalEventProvider;
}

/**
 * Sync operation result (simplified stats)
 */
export interface PLEventGuestSyncResult {
  eventUid: string;
  providerType: ExternalEventProvider;
  totalNoOfGuests: number;
  processed: number;
}

/**
 * Guest matched with a directory member
 */
export interface MatchedGuest {
  externalGuest: ExternalGuest;
  memberUid: string;
  teamUid: string | null;
}

/**
 * Event eligible for guest sync
 */
export interface SyncableEvent {
  uid: string;
  locationUid: string;
  externalEventId: string;
  providerType: ExternalEventProvider;
}

/**
 * Options for fetching guests from provider
 */
export interface GuestFetchOptions {
  eventId: string;
  status?: string;
  batchSize?: number;
}

/**
 * Interface for external guest providers (LUMA, Eventbrite, etc.)
 */
export interface IGuestProvider {
  readonly providerType: ExternalEventProvider;
  
  /**
   * Fetches guests in batches and invokes callback for each batch
   * @param onBatchReceived - Callback invoked with each batch of guests
   * @param options - Event ID, status filter, batch size
   * @returns Total number of guests fetched
   */
  fetchGuestsInBatches(
    onBatchReceived: (guests: ExternalGuest[]) => Promise<void>,
    options: GuestFetchOptions
  ): Promise<number>;
  
  /**
   * Returns true if provider has valid API credentials
   */
  isConfigured(): boolean;
}
