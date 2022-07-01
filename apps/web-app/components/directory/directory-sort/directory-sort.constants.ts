import { SortAscendingIcon, SortDescendingIcon } from '@heroicons/react/solid';
import {
  IDirectorySortDropdownOption,
  TDirectorySortOption,
} from './directory-sort.types';

export const DEFAULT_SORT_OPTION: TDirectorySortOption = 'Name,asc';
export const DIRECTORY_SORT_DROPDOWN_OPTIONS: IDirectorySortDropdownOption[] = [
  { label: 'Ascending', icon: SortAscendingIcon, value: 'Name,asc' },
  { label: 'Descending', icon: SortDescendingIcon, value: 'Name,desc' },
];
