import { Injectable, Logger } from '@nestjs/common';
import { PostHogProvider } from '../provider/posthog.provider';
import { ConsoleProvider } from '../provider/console.provider';
import { IAnalyticsProvider, IAnalyticsEvent } from '../analytics.interface';
import { ANALYTICS_PROVIDER } from '../../utils/constants';
import { DbProvider } from '../provider/db.provider';
import {HybridConsoleDbProvider} from "../provider/hybrid.provider";

/**
 * Main analytics service that wraps different analytics providers
 * Automatically selects the appropriate provider based on configuration
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private provider: IAnalyticsProvider;

  constructor(
    private readonly postHogProvider: PostHogProvider,
    private readonly consoleProvider: ConsoleProvider,
    private readonly dbProvider: DbProvider,
    private readonly hybridConsoleDbProvider: HybridConsoleDbProvider,
  ) {
    this.provider = this.selectProvider();
    this.logger.log(`Analytics provider initialized: ${this.provider.constructor.name}`);
  }

  private selectProvider(): IAnalyticsProvider {
    const analyticsProvider = process.env.ANALYTICS_PROVIDER;

    // Explicit provider selection
    if (analyticsProvider === ANALYTICS_PROVIDER.POSTHOG) {
      return this.postHogProvider;
    }
    if (analyticsProvider === ANALYTICS_PROVIDER.CONSOLE) {
      return this.consoleProvider;
    }
    if (analyticsProvider === ANALYTICS_PROVIDER.DB) {
      return this.dbProvider;
    }
    if (analyticsProvider === ANALYTICS_PROVIDER.HYBRID) {
      return this.hybridConsoleDbProvider; // HYBRID = Console + DB
    }

    // Auto-detection based on PostHog config
    const postHogApiKey = process.env.POSTHOG_API_KEY;
    const postHogHost = process.env.POSTHOG_HOST;

    if (postHogApiKey && postHogHost) {
      return this.postHogProvider;
    }

    // Default to console for development
    return this.consoleProvider;
  }

  async trackEvent(event: IAnalyticsEvent): Promise<void> {
    try {
      await this.provider.trackEvent(event);
    } catch (error) {
      this.logger.error(`Failed to track event: ${event.name}`, error);
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.provider.shutdown();
      this.logger.log('Analytics service shutdown completed');
    } catch (error) {
      this.logger.error('Failed to shutdown analytics service', error);
    }
  }

  // Utility method to check which provider is active
  getActiveProvider(): string {
    return this.provider.constructor.name;
  }
}
