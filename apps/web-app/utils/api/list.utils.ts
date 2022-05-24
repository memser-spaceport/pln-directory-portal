import { ParsedUrlQuery } from 'querystring';
import {
  directorySortOptions,
  TDirectorySortOption,
} from '../../components/directory/directory-sort/directory-sort.types';

/**
 * Returns an options for requesting a list of teams or labbers, by parsing
 * the provided query parameters.
 */
export function getListRequestOptionsFromQuery(queryParams: ParsedUrlQuery) {
  const { sort } = queryParams;

  return {
    sort: [getSortFromQuery(sort?.toString())],
  };
}

/**
 * Gets sort options by parsing the provided sort query parameter.
 */
function getSortFromQuery(sortQuery?: string) {
  const sort = isSortValid(sortQuery) ? sortQuery : 'Name,asc';
  const sortSettings = sort.split(',');

  return {
    field: sortSettings[0],
    direction: sortSettings[1] as 'asc' | 'desc',
  };
}

/**
 * Checks if provided sort query parameter exists and is valid.
 */
function isSortValid(sortQuery?: string) {
  return (
    sortQuery &&
    directorySortOptions.includes(sortQuery as TDirectorySortOption)
  );
}
