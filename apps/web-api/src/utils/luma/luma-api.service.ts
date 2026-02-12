import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

/** LUMA API configuration */
const CONFIG = {
  BASE_URL: process.env.LUMA_API_URL ?? 'https://public-api.luma.com',
  API_KEY: process.env.LUMA_API_KEY,
  TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
  RATE_LIMIT_WAIT_MS: 60000,
};

/** 
 * Raw LUMA API entry structure
 * All guest data is nested inside the 'guest' property
 */
interface LumaApiEntry {
  api_id: string;
  guest: {
    api_id: string;
    email: string;
    name: string;
    approval_status: string;
    registered_at: string;
  };
}

/** LUMA API response */
interface LumaApiResponse {
  entries: LumaApiEntry[];
  next_cursor?: string;
  has_more: boolean;
}

/** Normalized guest data */
export interface LumaGuest {
  id: string;
  email: string;
  name: string;
  approvalStatus: string;
  registeredAt: string;
}

/** Options for fetching guests */
export interface LumaFetchParams {
  eventId: string;
  status?: string;
}

/**
 * Service for interacting with LUMA API
 * Handles pagination and rate limiting automatically
 */
@Injectable()
export class LumaApiService {
  private readonly logger = new Logger(LumaApiService.name);

  /** Returns true if API key is configured */
  isConfigured(): boolean {
    return !!CONFIG.API_KEY && !!CONFIG.BASE_URL;
  }

  /**
   * Fetches all guests for an event in batches
   * @param onBatchReceived - Callback for each batch of normalized guests
   * @param options - eventId and optional status filter
   * @returns Total number of guests fetched
   */
  async fetchGuestsInBatches(
    onBatchReceived: (guests: LumaGuest[]) => Promise<void>,
    options: LumaFetchParams
  ): Promise<number> {
    if (!this.isConfigured()) {
      this.logger.warn('LUMA API not configured - missing API key');
      return 0;
    }

    let cursor: string | undefined;
    let hasMore = true;
    let total = 0;

    this.logger.log(`Fetching guests for event: ${options.eventId}`);

    while (hasMore) {
      const response = await this.fetchPage(options, cursor);
      
      if (response.entries?.length) {
        const guests = this.normalizeEntries(response.entries);
        total += guests.length;
        await onBatchReceived(guests);
      }

      cursor = response.next_cursor;
      hasMore = response.has_more;
    }

    this.logger.log(`Fetched ${total} guests for event: ${options.eventId}`);
    return total;
  }

  /**
   * Normalizes LUMA API entries to flat guest structure
   * All data comes from entry.guest
   */
  private normalizeEntries(entries: LumaApiEntry[]): LumaGuest[] {
    return entries
      .filter(entry => entry.guest?.email)
      .map(entry => ({
        id: entry.guest.api_id,
        email: entry.guest.email,
        name: entry.guest.name,
        approvalStatus: entry.guest.approval_status,
        registeredAt: entry.guest.registered_at,
      }));
  }

  /**
   * Fetches a single page of guests from LUMA API
   */
  private async fetchPage(
    options: LumaFetchParams,
    cursor?: string,
    attempt = 0
  ): Promise<LumaApiResponse> {
    try {
      const response = await axios.get<LumaApiResponse>(
        `${CONFIG.BASE_URL}/v1/event/get-guests`,
        {
          headers: {
            'x-luma-api-key': CONFIG.API_KEY,
            'Content-Type': 'application/json',
          },
          params: {
            event_api_id: options.eventId,
            approval_status: options.status ?? 'approved',
            ...(cursor && { pagination_cursor: cursor }),
          },
          timeout: CONFIG.TIMEOUT_MS,
        }
      );
      return response.data;
    } catch (error) {
      return this.handleError(error, options, cursor, attempt);
    }
  }

  /**
   * Handles API errors with retry logic for rate limiting
   */
  private async handleError(
    error: unknown,
    options: LumaFetchParams,
    cursor?: string,
    attempt = 0
  ): Promise<LumaApiResponse> {
    const axiosError = error as AxiosError;
    const isRateLimited = axiosError.response?.status === 429;
    const canRetry = attempt < CONFIG.MAX_RETRIES;

    if (isRateLimited && canRetry) {
      this.logger.warn(`Rate limited. Waiting 60s before retry ${attempt + 1}/${CONFIG.MAX_RETRIES}`);
      await this.wait(CONFIG.RATE_LIMIT_WAIT_MS);
      return this.fetchPage(options, cursor, attempt + 1);
    }

    this.logger.error(`API request failed: ${axiosError.message}`);
    throw error;
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
