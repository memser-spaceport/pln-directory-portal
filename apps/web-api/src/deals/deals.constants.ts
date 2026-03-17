export const DEAL_CATEGORIES = [
  'Hosting & Infrastructure',
  'Developer Tools',
  'Design & Collaboration',
  'Analytics & Monitoring',
  'Security & Compliance',
] as const;

export type DealCategory = (typeof DEAL_CATEGORIES)[number];
