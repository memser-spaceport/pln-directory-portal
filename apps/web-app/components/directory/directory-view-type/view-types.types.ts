export const viewTypes = ['grid', 'list'] as const;
export type TViewType = typeof viewTypes[number];
