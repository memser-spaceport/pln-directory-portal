import { Injectable } from '@nestjs/common';
import { IAnalyticsEvent, IAnalyticsProvider } from '../analytics.interface';
import { ConsoleProvider } from './console.provider';
import { DbProvider } from './db.provider';

/**
 * Hybrid provider: fan-out to Console + DB.
 */
@Injectable()
export class HybridConsoleDbProvider implements IAnalyticsProvider {
  constructor(
    private readonly consoleProvider: ConsoleProvider,
    private readonly dbProvider: DbProvider,
  ) {}

  async trackEvent(event: IAnalyticsEvent): Promise<void> {
    const errors: any[] = [];
    await Promise.all([
     // this.consoleProvider.trackEvent(event).catch(e => errors.push({ provider: 'ConsoleProvider', error: e })),
      this.dbProvider.trackEvent(event).catch(e => errors.push({ provider: 'DbProvider', error: e })),
    ]);
    if (errors.length) {
      // Local error log inside new file only
      // eslint-disable-next-line no-console
      console.error('[HybridConsoleDbProvider] Some providers failed', errors);
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.consoleProvider.shutdown().catch(() => undefined),
      this.dbProvider.shutdown().catch(() => undefined),
    ]);
  }
}
