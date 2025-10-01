import { Injectable } from '@nestjs/common';
import { IAnalyticsProvider, IAnalyticsEvent } from '../analytics.interface';

/**
 * Console implementation of the analytics provider interface
 * Logs events to the console for development/debugging purposes
 */
@Injectable()
export class ConsoleProvider implements IAnalyticsProvider {
  async trackEvent(event: IAnalyticsEvent): Promise<void> {
    console.log('📊 Analytics Event:', {
      name: event.name,
      distinctId: event.distinctId,
      properties: event.properties,
      timestamp: new Date().toISOString()
    });
  }

  async shutdown(): Promise<void> {
    console.log('📊 Analytics Service Shutdown');
  }
} 