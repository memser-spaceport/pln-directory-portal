import { URL_QUERY_VALUE_SEPARATOR } from '../../../../constants';
import { IFilterTag } from './directory-tags-filter/directory-tags-filter.types';

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

  return allValues.map((value) => {
    const selected = queryValuesArr.includes(value);
    const available = availableValues.includes(value);
    const disabled = !selected && !available;

    return { value, selected, disabled };
  });
}