import { ParsedUrlQuery } from 'querystring';
import {
  directorySortOptions,
  TDirectorySortOption,
} from '../../components/directory/directory-sort/directory-sort.types';
import { URL_QUERY_VALUE_SEPARATOR } from '../../constants';

/**
 * Returns an options for requesting a list of teams or members, by parsing
 * the provided query parameters.
 */
export function getListRequestOptionsFromQuery(queryParams: ParsedUrlQuery) {
  const { sort, industry, fundingVehicle, fundingStage, searchBy } =
    queryParams;

  return {
    sort: [getSortFromQuery(sort?.toString())],
    filterByFormula: getFormula({
      industry,
      fundingVehicle,
      fundingStage,
      searchBy,
    }),
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

/**
 * Get formula for list filtering.
 */
function getFormula({
  industry,
  fundingVehicle,
  fundingStage,
  searchBy,
}: {
  [key: string]: string | string[] | undefined;
}) {
  const formula = [
    'AND(',
    [
      ...(searchBy ? [getSearchFormulaFromQuery(searchBy)] : []),
      ...(industry ? [getFieldFromQuery('Industry', industry)] : []),
      ...(fundingVehicle
        ? [getFieldFromQuery('Funding Vehicle', fundingVehicle)]
        : []),
      ...(fundingStage
        ? [getFieldFromQuery('Funding Stage', fundingStage)]
        : []),
    ].join(', '),
    ')',
  ].join('');

  return formula;
}

/**
 * Returns formula to find matching results with names starting with the provided search query parameter
 */
function getSearchFormulaFromQuery(searchQuery: string | string[] = '') {
  return `REGEX_MATCH({Name}, "(?i)^(${searchQuery.toString()})")`;
}

/**
 * Get the Airtable filtering formula for a multiple value filter.
 */
function getFieldFromQuery(
  fieldName: string,
  queryValue: string | string[] = []
) {
  const values = Array.isArray(queryValue)
    ? queryValue
    : queryValue.split(URL_QUERY_VALUE_SEPARATOR);
  const valuesFormulas = values.map(
    (value) => `SEARCH("${value}", {${fieldName}})`
  );

  return valuesFormulas.join(', ');
}
