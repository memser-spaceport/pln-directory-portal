import { Dropdown } from '@protocol-labs-network/ui';
import React, { useCallback, useMemo } from 'react';
import { DirectorySortButtonContent } from './directory-sort-button-content';
import { DIRECTORY_SORT_DROPDOWN_OPTIONS } from './directory-sort.constants';
import { IDirectorySortDropdownOption } from './directory-sort.types';
import { useDirectorySortOption } from './use-directory-sort-option.hook';

export function DirectorySort() {
  const { selectedDirectorySortOption, changeDirectorySortOption } =
    useDirectorySortOption();
  const directorySortDropdownOptions = useMemo(
    () => DIRECTORY_SORT_DROPDOWN_OPTIONS,
    []
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
    <div className="flex items-center">
      <span className="mr-2 text-sm w-full">Sort by:</span>
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
    </div>
  );
}
