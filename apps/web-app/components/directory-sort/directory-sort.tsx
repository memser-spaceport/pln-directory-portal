import { SortAscendingIcon, SortDescendingIcon } from '@heroicons/react/solid';
import { Dropdown } from '@protocol-labs-network/ui';
import React from 'react';
import { DirectorySortButtonContent } from './directory-sort-button-content';
import { IDirectorySortDropdownOption } from './directory-sort.types';
import { useDirectorySortOption } from './use-directory-sort-option.hook';

export function DirectorySort() {
  const { selectedDirectorySortOption, changeDirectorySortOption } =
    useDirectorySortOption();

  const directorySortDropdownOptions: IDirectorySortDropdownOption[] = [
    { label: 'A-Z', icon: SortDescendingIcon, value: 'Name,asc' },
    { label: 'Z-A', icon: SortAscendingIcon, value: 'Name,desc' },
  ];

  const selectedDirectorySortDropdownOption = directorySortDropdownOptions.find(
    (option) => option.value === selectedDirectorySortOption
  );

  function onDropdownOptionChange(
    directorySortDropdownOption: IDirectorySortDropdownOption
  ) {
    changeDirectorySortOption(directorySortDropdownOption.value);
  }

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
