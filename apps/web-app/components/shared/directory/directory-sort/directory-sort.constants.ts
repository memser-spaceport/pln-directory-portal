import { SortAscendingIcon, SortDescendingIcon } from '@heroicons/react/solid';
import {
  IDirectorySortDropdownOption,
  TDirectorySortOption,
} from './directory-sort.types';
import { StarIcon } from '@heroicons/react/outline';

export const DEFAULT_SORT_OPTION: TDirectorySortOption = 'Name,asc';
export const PROJECT_DEFAULT_SORT_OPTION: TDirectorySortOption = 'Score,asc';

export const  DIRECTORY_SORT_DROPDOWN_OPTIONS: IDirectorySortDropdownOption[] = [
  { label: 'Ascending', icon: SortAscendingIcon, value: 'Name,asc', supportedPages: ['members', 'teams', 'projects'] },
  { label: 'Descending', icon: SortDescendingIcon, value: 'Name,desc', supportedPages: ['members', 'teams', 'projects'] },
  { label: 'By Score', icon: StarIcon, value: 'Score,asc', supportedPages: ['projects'] },
];
