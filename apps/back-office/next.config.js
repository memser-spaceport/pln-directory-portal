const path = require('path');
const { PHASE_PRODUCTION_BUILD } = require('next/constants');

const AWS_S3_DOMAIN = process.env.AWS_S3_DOMAIN || '';

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  env: {
    WEB_API_BASE_URL: process.env.WEB_API_BASE_URL,
    ADMIN_LOGIN_USERNAME: process.env.ADMIN_LOGIN_USERNAME,
    ADMIN_LOGIN_PASSWORD: process.env.ADMIN_LOGIN_PASSWORD,
    WEB_UI_BASE_URL: process.env.WEB_UI_BASE_URL,
  },
  /*
   * The back-office is an internal admin tool, never a search result (LAB-2924). Google indexed admin.os.pl.xyz, and
   * Search Console listed it on os.pl.xyz's domain property. A response header covers every route and asset; robots.txt
   * is left alone, because a crawler blocked from a page never sees that page's noindex.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
  // Lets SWC compile the workspace libs (libs/ui, libs/contracts) that the tsconfig path aliases point to.
  experimental: {
    externalDir: true,
  },
  // The repository root is the workspace root (one yarn.lock for every app).
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // Lint runs in its own target (`nx run back-office:lint`), not inside `next build`.
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // List remote hosts that have access to Next.js Image Optimization API,
    // to protect the app from malicious users.
    // Include both env and known buckets so local/dev can render prod image URLs.
    remotePatterns: [
      'loremflickr.com',
      'files.plnetwork.io',
      AWS_S3_DOMAIN,
      'pl-directory-images-dev.s3.us-west-1.amazonaws.com',
      'pl-directory-images-prod.s3.us-west-1.amazonaws.com',
    ]
      .filter(Boolean)
      .map((hostname) => ({ hostname })),
    // Enable `dangerouslyAllowSVG` and `contentSecurityPolicy` to serve
    // SVG images using the default Image Optimization API
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Configure the Time to Live (TTL) in seconds for caching optimized images
    minimumCacheTTL: 300,
  },
  webpack(config) {
    // `import { ReactComponent as Icon } from './icon.svg'` renders the SVG inline. SVGs referenced from CSS, or
    // imported with `?url`, keep Next's own asset handling.
    const assetRule = config.module.rules.find((rule) => rule.test?.test?.('.svg'));
    config.module.rules.push({ ...assetRule, test: /\.svg$/i, resourceQuery: /url/ });
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: assetRule.issuer,
      resourceQuery: { not: [...(assetRule.resourceQuery?.not ?? []), /url/] },
      use: [
        {
          loader: '@svgr/webpack',
          options: {
            exportType: 'named',
            namedExport: 'ReactComponent',
            svgoConfig: {
              plugins: [{ name: 'preset-default', params: { overrides: { removeViewBox: false } } }],
            },
          },
        },
      ],
    });
    assetRule.exclude = /\.svg$/i;
    return config;
  },
};

// The production build goes to dist/apps/back-office/.next. `next start dist/apps/back-office` (feature env) loads
// the copy of this file placed there by the build target, so every other phase keeps the default `.next`.
module.exports = (phase) => ({
  ...nextConfig,
  distDir: phase === PHASE_PRODUCTION_BUILD ? '../../dist/apps/back-office/.next' : '.next',
});
