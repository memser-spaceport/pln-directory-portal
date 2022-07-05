import { IFilterTag } from '../../../components/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { URL_QUERY_VALUE_SEPARATOR } from '../../../constants';

/**
 * Get tags from provided filter values, identifying:
 * - the selected ones, based on the query parameter value
 * - the disabled ones, based on either they're available or not to be selected
 */
export function getTagsFromValues(
  allValues: string[],
  availableValues: string[],
  queryValues: string | string[] = []
): IFilterTag[] {
  const queryValuesArr = Array.isArray(queryValues)
    ? queryValues
    : queryValues.split(URL_QUERY_VALUE_SEPARATOR);

  return allValues.map((value) => ({
    value,
    selected: queryValuesArr.includes(value),
    disabled: !availableValues.includes(value),
  }));
}
