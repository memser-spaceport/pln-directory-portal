import { IDropdownOption } from '@protocol-labs-network/ui';

export const directorySortOptions = ['Name,asc', 'Name,desc'] as const;
export type TDirectorySortOption = typeof directorySortOptions[number];

export interface IDirectorySortDropdownOption extends IDropdownOption {
  value?: TDirectorySortOption;
}

export type TListSortDirection = 'asc' | 'desc';
