// eslint-disable-next-line @typescript-eslint/no-var-requires
const withNx = require('@nrwl/next/plugins/with-nx');
const { withSentryConfig } = require('@sentry/nextjs');
const path = require('path');

/**
 * @type {import('@nrwl/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {
    // Set this to true if you would like to to use SVGR
    // See: https://github.com/gregberge/svgr
    svgr: true,
  },
  images: {
    // List remote domains that have access to Next.js Image Optimization API,
    // to protect the app from malicious users
    domains: ['dl.airtable.com'],
    // Enable `dangerouslyAllowSVG` and `contentSecurityPolicy` to serve
    // SVG images using the default Image Optimization API
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Configure the Time to Live (TTL) in seconds for caching optimized images
    minimumCacheTTL: 300,
  },
  experimental: {
    // this includes files from the monorepo base two directories up
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/teams',
        permanent: false,
      },
    ];
  },
};

const sentryWebpackPluginOptions = {
  silent: true,
  include: 'dist/apps/web-app/.next',
};

module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(withNx(nextConfig), sentryWebpackPluginOptions)
  : withNx(nextConfig);
