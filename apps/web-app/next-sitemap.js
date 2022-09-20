const { getSiteUrl } = require('../web-app/utils/sitemap/sitemap.utils');

const siteUrl = getSiteUrl(process.env.VERCEL_ENV, process.env.VERCEL_URL);

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl,
  generateRobotsTxt: process.env.VERCEL_ENV === 'production',
  sourceDir: 'dist/apps/web-app/.next',
  outDir: 'dist/apps/web-app/public',
  exclude: ['/members/sitemap.xml', '/teams/sitemap.xml'],
  robotsTxtOptions: {
    additionalSitemaps: [
      `${siteUrl}/members/sitemap.xml`,
      `${siteUrl}/teams/sitemap.xml`,
    ],
  },
};
