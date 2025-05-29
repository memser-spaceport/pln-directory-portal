import { Module, Global } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PostHogProvider } from './providers/posthog.provider';
import { ConsoleProvider } from './providers/console.provider';

/**
 * Global analytics module that provides the AnalyticsService
 * Automatically configures the appropriate provider based on environment
 */
@Global()
@Module({
  providers: [
    PostHogProvider,
    ConsoleProvider,
    AnalyticsService,
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {} 