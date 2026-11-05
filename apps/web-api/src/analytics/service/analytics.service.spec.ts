jest.mock('../provider/posthog.provider', () => ({ PostHogProvider: class PostHogProvider {} }));
jest.mock('../provider/console.provider', () => ({ ConsoleProvider: class ConsoleProvider {} }));
jest.mock('../provider/db.provider', () => ({ DbProvider: class DbProvider {} }));
jest.mock('../provider/hybrid.provider', () => ({ HybridConsoleDbProvider: class HybridConsoleDbProvider {} }));

import { AnalyticsService } from './analytics.service';
import { ANALYTICS_PROVIDER } from '../../utils/constants';
import { IAnalyticsProvider } from '../analytics.interface';

function provider(): IAnalyticsProvider {
  return {
    trackEvent: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AnalyticsService', () => {
  const original = process.env.ANALYTICS_PROVIDER;

  afterEach(() => {
    if (original === undefined) delete process.env.ANALYTICS_PROVIDER;
    else process.env.ANALYTICS_PROVIDER = original;
  });

  function service(kind: string) {
    process.env.ANALYTICS_PROVIDER = kind;
    const posthog = provider();
    const db = provider();
    const analytics = new AnalyticsService(posthog as never, provider() as never, db as never, provider() as never);
    return { analytics, posthog, db };
  }

  it('sends an mcp event to PostHog when the database provider is selected', async () => {
    const { analytics, posthog, db } = service(ANALYTICS_PROVIDER.DB);
    const event = { name: 'mcp-search-members-called', distinctId: 'member-1', properties: { result: 'ok' } };

    await analytics.trackEvent(event);

    expect(db.trackEvent).toHaveBeenCalledWith(event);
    expect(posthog.trackEvent).toHaveBeenCalledWith(event);
  });

  it('keeps a non-mcp event off PostHog when the database provider is selected', async () => {
    const { analytics, posthog, db } = service(ANALYTICS_PROVIDER.DB);

    await analytics.trackEvent({ name: 'auth_user_login', distinctId: 'member-1' });

    expect(db.trackEvent).toHaveBeenCalledTimes(1);
    expect(posthog.trackEvent).not.toHaveBeenCalled();
  });

  it('sends an mcp event to PostHog once when PostHog is the provider', async () => {
    const { analytics, posthog, db } = service(ANALYTICS_PROVIDER.POSTHOG);

    await analytics.trackEvent({ name: 'mcp-tool-invoked', distinctId: 'member-1' });

    expect(posthog.trackEvent).toHaveBeenCalledTimes(1);
    expect(db.trackEvent).not.toHaveBeenCalled();
  });
});
