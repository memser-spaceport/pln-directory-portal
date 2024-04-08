import { Dropdown } from '@protocol-labs-network/ui';
import React, { useCallback, useMemo } from 'react';
import { DirectorySortButtonContent } from './directory-sort-button-content';
import { DEFAULT_SORT_OPTION, DIRECTORY_SORT_DROPDOWN_OPTIONS, PROJECT_DEFAULT_SORT_OPTION } from './directory-sort.constants';
import { IDirectorySortDropdownOption } from './directory-sort.types';
import { useDirectorySortOption } from './use-directory-sort-option.hook';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';

interface IDirectorySortProps {
  directoryType?: string;
}

export function DirectorySort(props: IDirectorySortProps) {
  const directoryType = props?.directoryType;
  const analytics = useAppAnalytics();

    let defaultSortOption;
    if (directoryType === 'projects') {
      defaultSortOption = PROJECT_DEFAULT_SORT_OPTION
    } else {
      defaultSortOption = DEFAULT_SORT_OPTION
    }

    const { selectedDirectorySortOption, changeDirectorySortOption } =
    useDirectorySortOption(defaultSortOption);

  
  const directorySortDropdownOptions = useMemo(() => {
    return DIRECTORY_SORT_DROPDOWN_OPTIONS.filter((option) =>
      option.supportedPages?.includes(`${directoryType}`)
    );
  }, [directoryType]);

  const captureEvent = (sortedBy) => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.DIRECTORY_LIST_SORTBY_CHANGED, {
      directoryType: directoryType,
      sortedBy: sortedBy
    })
  }

  const onDropdownOptionChange = useCallback(
    (directorySortDropdownOption: IDirectorySortDropdownOption) => {
      changeDirectorySortOption(directorySortDropdownOption.value);
      captureEvent(directorySortDropdownOption.value);
    },
    [changeDirectorySortOption]
  );

  const selectedDirectorySortDropdownOption = directorySortDropdownOptions.find(
    (option) => option.value === selectedDirectorySortOption
  );

  return (
    <div className="flex items-center">
      <span className="mr-2 w-full text-sm">Sort by:</span>
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
