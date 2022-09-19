const { getSiteUrl } = require('../web-app/utils/sitemap/sitemap.utils');

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: getSiteUrl(process.env.VERCEL_ENV, process.env.VERCEL_URL),
  generateRobotsTxt: process.env.VERCEL_ENV === 'production',
  sourceDir: 'dist/apps/web-app/.next',
  outDir: 'dist/apps/web-app/public',
};
