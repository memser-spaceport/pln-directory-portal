export const DEAL_CATEGORIES = [
  'Analytics',
  'CDN',
  'Database',
  'Design',
  'Development',
  'DevOps',
  'Hosting',
  'Monitoring',
  'Project Management',
  'Security',
  'Other',
] as const;

export const DEAL_CATEGORY_OPTIONS = DEAL_CATEGORIES.map((cat) => ({ value: cat, label: cat }));

export const DEAL_AUDIENCE_OPTIONS = [
  { value: 'All Founders', label: 'All Founders' },
  { value: 'PL Funded Founders', label: 'PL Funded Founders' },
  { value: 'Founders Forge', label: 'Founders Forge' },
] as const;
