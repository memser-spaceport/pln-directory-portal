export const ARTICLE_CATEGORIES = [
  'Legal & Finance',
  'Seed / Series A',
] as const;

export type ArticleCategory = typeof ARTICLE_CATEGORIES[number];

export const ARTICLE_CATEGORY_DESCRIPTIONS: Record<ArticleCategory, string> = {
  'Legal & Finance':
    'Entity formation, cap tables, equity, compliance, and financial planning for early-stage companies.',
  'Seed / Series A':
    'How to approach investors, structure your pitch, and negotiate terms at pre-seed, seed, and Series A.',
};

export const WORDS_PER_MINUTE = 200;
