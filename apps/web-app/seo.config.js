import { getSiteUrl } from './utils/sitemap/sitemap.utils';

const siteUrl = getSiteUrl(
  process.env.NEXT_PUBLIC_VERCEL_ENV,
  process.env.NEXT_PUBLIC_VERCEL_URL
);

export const DEFAULT_SEO = {
  titleTemplate: '%s | Protocol Labs Network',
  defaultTitle: 'Protocol Labs Network',
  description:
    'The Protocol Labs Network drives breakthroughs in computing to push humanity forward.',
  openGraph: {
    type: 'website',
    url: siteUrl,
    images: [
      {
        url: `${siteUrl}/assets/images/protocol-labs-open-graph.jpg`,
        width: 1280,
        height: 640,
        alt: 'Protocol Labs Network',
        type: 'image/jpeg',
      },
    ],
  },
  additionalMetaTags: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'theme-color', content: '#ffffff' },
    { name: 'msapplication-TileColor', content: '#ffffff' },
    { name: 'msapplication-TileImage', content: '/favicon-144x144.png' },
    { name: 'msapplication-config', content: '/browserconfig.xml' },
  ],
  additionalLinkTags: [
    { rel: 'apple-touch-icon', sizes: '57x57', href: '/favicon-57x57.png' },
    { rel: 'apple-touch-icon', sizes: '60x60', href: '/favicon-60x60.png' },
    { rel: 'apple-touch-icon', sizes: '72x72', href: '/favicon-72x72.png' },
    { rel: 'apple-touch-icon', sizes: '76x76', href: '/favicon-76x76.png' },
    { rel: 'apple-touch-icon', sizes: '114x114', href: '/favicon-114x114.png' },
    { rel: 'apple-touch-icon', sizes: '120x120', href: '/favicon-120x120.png' },
    { rel: 'apple-touch-icon', sizes: '144x144', href: '/favicon-144x144.png' },
    { rel: 'apple-touch-icon', sizes: '152x152', href: '/favicon-152x152.png' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicon-180x180.png' },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '16x16',
      href: '/favicon-16x16.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '32x32',
      href: '/favicon-32x32.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '96x96',
      href: '/favicon-96x96.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '192x192',
      href: '/favicon-192x192.png',
    },
    { rel: 'shortcut icon', type: 'image/x-icon', href: '/favicon.ico' },
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
    { rel: 'manifest', href: '/manifest.json' },
  ],
  twitter: {
    cardType: 'summary_large_image',
  },
};

export const DIRECTORY_SEO = {
  titleTemplate: '%s | Protocol Labs Directory',
  defaultTitle: 'Protocol Labs Directory',
  description:
    'The Protocol Labs Directory helps network members orient themselves within the network by making it easy to learn about other teams and members, including their roles, capabilities, and experiences.',
  openGraph: {
    images: [
      {
        url: `${siteUrl}/assets/images/protocol-labs-open-graph.jpg?v1`,
        width: 1280,
        height: 640,
        alt: 'Protocol Labs Directory',
        type: 'image/jpeg',
      },
    ],
  },
  additionalMetaTags: [
    { name: 'viewport', content: 'width=1272, user-scalable=no' },
  ],
};