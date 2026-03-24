export const ARTICLE_CATEGORIES = [
  'Legal & Finance',
  'US Visa / Immigration',
  'Press & PR',
  'Hire Handbook',
  'Seed / Series A',
  'PL Brand Use',
  'Crypto & Token Launch',
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

export const ARTICLE_CATEGORY_DESCRIPTIONS: Record<ArticleCategory, string> = {
  'Legal & Finance': 'Entity formation, cap tables, equity, compliance, and financial planning for early-stage companies.',
  'US Visa / Immigration': 'Visa options, founder-specific immigration strategies, and working with immigration counsel.',
  'Press & PR': 'How to get media coverage, write press releases, and build a public narrative for your startup.',
  'Hire Handbook': 'How to find, evaluate, compensate, and retain the right people as you scale from zero to your first team.',
  'Seed / Series A': 'How to approach investors, structure your pitch, and negotiate terms at pre-seed, seed, and Series A.',
  'PL Brand Use': 'Guidelines for portfolio companies on using the PL brand, logo, and co-marketing assets correctly.',
  'Crypto & Token Launch': 'Token design, regulatory considerations, launch mechanics, and community building for Web3.',
};

export const WORDS_PER_MINUTE = 200;
