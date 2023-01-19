import * as Sentry from '@sentry/nextjs';

Sentry.init({
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',
  normalizeDepth: 10,
});
