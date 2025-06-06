import { Injectable, Logger } from '@nestjs/common';
import { IAnalyticsProvider, IAnalyticsEvent } from '../analytics.interface';
import { PostHog } from 'posthog-node';
import { ANALYTICS_SOURCE } from '../../utils/constants';

/**
 * PostHog implementation of the analytics provider interface
 * Wraps the PostHog service to conform to the analytics interface
 */
@Injectable()
export class PostHogProvider implements IAnalyticsProvider {
  private readonly logger = new Logger(PostHogProvider.name);
  private client: PostHog | null = null;
  private readonly isEnabled: boolean;

  constructor() {
    this.isEnabled = !!(process.env.POSTHOG_API_KEY && process.env.POSTHOG_HOST);
    if (this.isEnabled) {
      this.client = new PostHog(
        process.env.POSTHOG_API_KEY!,
        {
          host: process.env.POSTHOG_HOST,
          flushAt: 20,
          flushInterval: 10000,
        }
      );
      this.logger.log('PostHog client initialized successfully');
    } else {
      this.logger.warn('PostHog is disabled. Missing POSTHOG_API_KEY or POSTHOG_HOST environment variables');
    }
  }

  /**
   * Track a generic event to PostHog
   * @param event The event data to track
   */
  async trackEvent(event: IAnalyticsEvent): Promise<void> {
    if (!this.isEnabled || !this.client) {
      this.logger.debug(`PostHog tracking disabled. Event: ${event.name}`);
      return;
    }
    try {
      this.client.capture({
        distinctId: event.distinctId,
        event: event.name,
        properties: {
          ...event.properties,
          timestamp: new Date().toISOString(),
          source: ANALYTICS_SOURCE
        }
      });
      this.logger.debug(`Event tracked: ${event.name} for user: ${event.distinctId}`);
    } catch (error) {
      this.logger.error(`Failed to track event ${event.name}:`, error);
    }
  }
  
  /**
   * Gracefully shutdown PostHog client
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
      this.logger.log('PostHog client shutdown completed');
    }
  }
} 