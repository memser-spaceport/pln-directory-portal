// eslint-disable-next-line @typescript-eslint/no-var-requires
const withNx = require('@nrwl/next/plugins/with-nx');
const { withSentryConfig } = require('@sentry/nextjs');
const path = require('path');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.WITH_BUNDLE_ANALYZER === 'true',
});

/**
 * @type {import('@nrwl/next/plugins/with-nx').WithNxOptions}
 **/
let nextConfig = {
  nx: {
    // Set this to true if you would like to to use SVGR
    // See: https://github.com/gregberge/svgr
    svgr: true,
  },
  images: {
    // List remote domains that have access to Next.js Image Optimization API,
    // to protect the app from malicious users
    domains: ['loremflickr.com', 'files.plnetwork.io'],
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
      ...(process.env.NEXT_PUBLIC_HIDE_NETWORK_PORTAL
        ? [
            {
              // Redirect from root to teams directory page
              source: '/',
              destination: '/directory/teams',
              permanent: false,
            },
          ]
        : []),
      {
        // Redirect from directory root to teams directory page
        source: '/directory',
        destination: '/directory/teams',
        permanent: false,
      },
      {
        // Redirect the old teams directory URL to the new `/directory` URL
        source: '/teams',
        destination: '/directory/teams',
        permanent: false,
      },
      {
        // Redirect the old team profile URLs to the new `/directory` URLs
        source: '/teams/:id*',
        destination: '/directory/teams/:id*',
        permanent: false,
      },
      {
        // Redirect the old members directory URL to the new `/directory` URL
        source: '/members',
        destination: '/directory/members',
        permanent: false,
      },
      {
        // Redirect the old member profile URLs to the new `/directory` URLs
        source: '/members/:id*',
        destination: '/directory/members/:id*',
        permanent: false,
      },
      {
        // Redirect the events path to the appropriate Events page
        source: '/events',
        destination: 'https://events.plnetwork.io/',
        permanent: false,
      },
    ];
  },
};

// apply bundle analyzer plugin configs
nextConfig = withBundleAnalyzer(nextConfig);

// apply nx plugin configs
nextConfig = withNx(nextConfig);

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const sentryWebpackPluginOptions = {
    silent: true,
    include: 'dist/apps/web-app/.next',
  };

  // apply sentry plugin configs
  nextConfig = withSentryConfig(nextConfig, sentryWebpackPluginOptions);
}

module.exports = nextConfig;
