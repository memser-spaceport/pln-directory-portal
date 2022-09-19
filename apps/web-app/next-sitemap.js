/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl:
    process.env.VERCEL_ENV === 'production'
      ? 'https://plnetwork.io'
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:4200',
  generateRobotsTxt: process.env.VERCEL_ENV === 'production',
  sourceDir: 'dist/apps/web-app/.next',
  outDir: 'dist/apps/web-app/public',
};
