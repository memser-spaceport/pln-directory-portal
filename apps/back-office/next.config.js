// eslint-disable-next-line @typescript-eslint/no-var-requires
const withNx = require('@nrwl/next/plugins/with-nx');
const AWS_S3_DOMAIN = process.env.AWS_S3_DOMAIN || '';

/**
 * @type {import('@nrwl/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  env: {
    WEB_API_BASE_URL: process.env.WEB_API_BASE_URL,
    ADMIN_LOGIN_USERNAME: process.env.ADMIN_LOGIN_USERNAME,
    ADMIN_LOGIN_PASSWORD: process.env.ADMIN_LOGIN_PASSWORD,
  },
  nx: {
    // Set this to true if you would like to to use SVGR
    // See: https://github.com/gregberge/svgr
    svgr: true,
  },
  images: {
    // List remote domains that have access to Next.js Image Optimization API,
    // to protect the app from malicious users
    domains: ['loremflickr.com', 'files.plnetwork.io', AWS_S3_DOMAIN],
    // Enable `dangerouslyAllowSVG` and `contentSecurityPolicy` to serve
    // SVG images using the default Image Optimization API
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Configure the Time to Live (TTL) in seconds for caching optimized images
    minimumCacheTTL: 300,
  },
};

module.exports = withNx(nextConfig);
