export const viewTypes = ['grid', 'list'] as const;
export type TViewType = typeof viewTypes[number];

export interface IDirectoryViewTypeOption {
  viewType: TViewType;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
}
