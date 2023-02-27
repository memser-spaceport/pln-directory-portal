import {
  directorySortOptions,
  TDirectorySortOption,
  TListSortDirection,
} from '../components/shared/directory/directory-sort/directory-sort.types';

/**
 * Gets sort options by parsing the provided sort query parameter.
 */
export function getSortFromQuery(sortQuery?: string) {
  const sort = isSortValid(sortQuery) ? sortQuery : 'Name,asc';
  const sortSettings = sort.split(',');

  return {
    field: sortSettings[0],
    direction: sortSettings[1] as TListSortDirection,
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

/**
 * Takes in a single argument values, which can be either a string or an array of strings,
 * and returns a string with the values separated by a comma.
 */
export function stringifyQueryValues(values: string | string[]) {
  return Array.isArray(values) ? values.toString() : values.replace(/\|/g, ',');
}
