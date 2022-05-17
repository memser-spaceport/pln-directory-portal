import { SortAscendingIcon, SortDescendingIcon } from '@heroicons/react/solid';
import { Dropdown } from '@protocol-labs-network/ui';
import React, { useCallback, useState } from 'react';
import { DirectorySortButtonContent } from './directory-sort-button-content';
import { IDirectorySortDropdownOption } from './directory-sort.types';
import { useDirectorySortOption } from './use-directory-sort-option.hook';

const DIRECTORY_SORT_DROPDOWN_OPTIONS: IDirectorySortDropdownOption[] = [
  { label: 'A-Z', icon: SortDescendingIcon, value: 'Name,asc' },
  { label: 'Z-A', icon: SortAscendingIcon, value: 'Name,desc' },
];

export function DirectorySort() {
  const { selectedDirectorySortOption, changeDirectorySortOption } =
    useDirectorySortOption();
  const [directorySortDropdownOptions] = useState(
    DIRECTORY_SORT_DROPDOWN_OPTIONS
  );

  const onDropdownOptionChange = useCallback(
    (directorySortDropdownOption: IDirectorySortDropdownOption) => {
      changeDirectorySortOption(directorySortDropdownOption.value);
    },
    [changeDirectorySortOption]
  );

  const selectedDirectorySortDropdownOption = directorySortDropdownOptions.find(
    (option) => option.value === selectedDirectorySortOption
  );

  return (
    <Dropdown
      options={directorySortDropdownOptions}
      onChange={onDropdownOptionChange}
      initialOption={selectedDirectorySortDropdownOption}
      buttonContent={
        <DirectorySortButtonContent
          selectedOption={selectedDirectorySortDropdownOption}
        />
      }
    />
  );
}
