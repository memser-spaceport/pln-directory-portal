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
  { value: 'FOUNDERS', label: 'Founders' },
  { value: 'DEVELOPERS', label: 'Developers' },
  { value: 'EVERYONE', label: 'Everyone' },
] as const;
