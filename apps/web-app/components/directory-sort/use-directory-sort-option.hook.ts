import { useRouter } from 'next/router';
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

  function changeDirectorySortOption(sortOption: TDirectorySortOption) {
    push(
      {
        pathname,
        query: { ...query, sort: sortOption },
      },
      undefined,
      {
        shallow: true,
      }
    );
  }

  return { selectedDirectorySortOption, changeDirectorySortOption };
}
