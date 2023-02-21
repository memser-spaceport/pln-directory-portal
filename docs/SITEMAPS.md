# Sitemap

## Installation and configuration

We use [`next-sitemap`](https://www.npmjs.com/package/next-sitemap) to generate both static and dynamic sitemaps. This package requires a basic config file which can be found at [apps/web-app/next-sitemap.js](apps/web-app/next-sitemap.js).

### Dynamic Sitemaps

`next-sitemap` allows to generate dynamic sitemaps. To generate dynamic sitemaps, we create `sitemap.xml.tsx` files within the `pages` next to the files for the corresponding route, and use Next.js pages' `getServerSideProps` method to fill it with he necessary sitemap items (e.g., fetching all teams from the database and mapping them to `ISitemapField` objects).

## Generating the Sitemap

To generate the sitemap, run the following command:

`nx run web-app:postbuild`

This command generates a sitemap of the app along with a `robots.txt` file. The resulting `sitemap.xml` and `robots.txt` files will be stored in the `dist/apps/web-app/public` directory.
