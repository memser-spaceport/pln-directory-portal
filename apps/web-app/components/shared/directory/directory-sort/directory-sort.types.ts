import { IDropdownOption } from '@protocol-labs-network/ui';

export const directorySortOptions = ['Name,asc', 'Name,desc', 'Score,asc'] as const;
export type TDirectorySortOption = typeof directorySortOptions[number];

export interface IDirectorySortDropdownOption extends IDropdownOption {
  value?: TDirectorySortOption;
  supportedPages?:string[];
}

export type TListSortDirection = 'asc' | 'desc';
