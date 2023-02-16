import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { DEFAULT_SORT_OPTION } from './directory-sort.constants';
import {
  directorySortOptions,
  TDirectorySortOption,
} from './directory-sort.types';

export function useDirectorySortOption() {
  const { query, push, pathname } = useRouter();
  const querySortOption = query.sort as TDirectorySortOption;
  const selectedDirectorySortOption: TDirectorySortOption =
    querySortOption && directorySortOptions.includes(querySortOption)
      ? querySortOption
      : DEFAULT_SORT_OPTION;

  const changeDirectorySortOption = useCallback(
    (sortOption: TDirectorySortOption) => {
      const { sort, ...restQuery } = query;

      push({
        pathname,
        query: {
          ...restQuery,
          ...(sortOption !== DEFAULT_SORT_OPTION && { sort: sortOption }),
        },
      });
    },
    [query, push, pathname]
  );

  return { selectedDirectorySortOption, changeDirectorySortOption };
}
