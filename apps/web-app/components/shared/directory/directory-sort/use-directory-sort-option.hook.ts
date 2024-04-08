import { useRouter } from 'next/router';
import { useCallback } from 'react';
import {
  directorySortOptions,
  TDirectorySortOption,
} from './directory-sort.types';

export function useDirectorySortOption(defaultSort) {
  const { query, push, pathname } = useRouter();
  const querySortOption = query.sort as TDirectorySortOption;

  const selectedDirectorySortOption: TDirectorySortOption =
    querySortOption && directorySortOptions.includes(querySortOption)
      ? querySortOption
      : defaultSort;

  const changeDirectorySortOption = useCallback(
    (sortOption: TDirectorySortOption) => {
      const { sort, ...restQuery } = query;

      push({
        pathname,
        query: {
          ...restQuery,
          ...(sortOption !== defaultSort && { sort: sortOption }),
        },
      });
    },
    [query, push, pathname]
  );

  return { selectedDirectorySortOption, changeDirectorySortOption };
}
