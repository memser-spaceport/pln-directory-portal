// eslint-disable-next-line @typescript-eslint/no-var-requires
const withNx = require('@nrwl/next/plugins/with-nx');

/**
 * @type {import('@nrwl/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  env: {
    NEXT_PUBLIC_USERNAME: process.env.NEXT_PUBLIC_USERNAME,
    NEXT_PUBLIC_PASSWORD: process.env.NEXT_PUBLIC_PASSWORD,
  },
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
};

module.exports = withNx(nextConfig);
