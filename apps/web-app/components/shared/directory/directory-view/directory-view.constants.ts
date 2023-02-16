import { ViewGridIcon, ViewListIcon } from '@heroicons/react/outline';
import { IDirectoryViewTypeOption, TViewType } from './directory-view.types';

export const DEFAULT_VIEW_TYPE: TViewType = 'grid';
export const DIRECTORY_VIEW_TYPE_OPTIONS: IDirectoryViewTypeOption[] = [
  { viewType: 'grid', icon: ViewGridIcon, label: 'Change to grid view' },
  { viewType: 'list', icon: ViewListIcon, label: 'Change to list view' },
];
