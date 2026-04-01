/** Shown on the high-value checkbox and catalog table for `isHighValue` deals. */
export const HIGH_VALUE_DEAL_LABEL = 'This deal is High Value ⭐';

export const DEAL_CATEGORIES = [
  'Cloud Credits & Infra',
  'Security & Audits',
  'AI & Developer Tools',
  'Finance',
] as const;

export const DEAL_CATEGORY_OPTIONS = DEAL_CATEGORIES.map((cat) => ({ value: cat, label: cat }));

export const DEAL_AUDIENCE_OPTIONS = [
  { value: 'All Founders', label: 'All Founders' },
  { value: 'PL Funded Founders', label: 'PL Funded Founders' },
  { value: 'Founders Forge', label: 'Founders Forge' },
] as const;
