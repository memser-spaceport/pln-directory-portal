import { useRouter } from 'next/router';
import { useCallback } from 'react';
import {
  directorySortOptions,
  TDirectorySortOption,
} from './directory-sort.types';

export function useDirectorySortOption(
  initialOption: TDirectorySortOption = 'Name,asc'
) {
  const { query, push, pathname } = useRouter();
  const querySortOption = query.sort as TDirectorySortOption;
  const selectedDirectorySortOption: TDirectorySortOption =
    querySortOption && directorySortOptions.includes(querySortOption)
      ? querySortOption
      : initialOption;

  const changeDirectorySortOption = useCallback(
    (sortOption: TDirectorySortOption) => {
      push({
        pathname,
        query: { ...query, sort: sortOption },
      });
    },
    [query, push, pathname]
  );

  return { selectedDirectorySortOption, changeDirectorySortOption };
}
