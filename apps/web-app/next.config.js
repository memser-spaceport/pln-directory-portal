// eslint-disable-next-line @typescript-eslint/no-var-requires
const withNx = require('@nrwl/next/plugins/with-nx');
const { withSentryConfig } = require('@sentry/nextjs');

/**
 * @type {import('@nrwl/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {
    // Set this to true if you would like to to use SVGR
    // See: https://github.com/gregberge/svgr
    svgr: true,
  },
};

const sentryWebpackPluginOptions = {
  silent: true,
  include: 'dist/apps/web-app/.next',
};

module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(withNx(nextConfig), sentryWebpackPluginOptions)
  : withNx(nextConfig);
