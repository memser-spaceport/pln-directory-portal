export interface IAnalyticsEvent {
  name: string;
  distinctId: string;
  properties?: Record<string, any>;
}

/**
 * Interface for analytics providers
 * Simple generic interface for tracking events
 */
export interface IAnalyticsProvider {
  /**
   * Track a generic event
   */
  trackEvent(event: IAnalyticsEvent): Promise<void>;

  /**
   * Gracefully shutdown the provider
   */
  shutdown(): Promise<void>;
} 