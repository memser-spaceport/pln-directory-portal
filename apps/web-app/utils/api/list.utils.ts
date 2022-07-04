import { IListOptions, TListSortDirection } from '@protocol-labs-network/api';
import { ParsedUrlQuery } from 'querystring';
import {
  directorySortOptions,
  TDirectorySortOption,
} from '../../components/directory/directory-sort/directory-sort.types';
import { URL_QUERY_VALUE_SEPARATOR } from '../../constants';

/**
 * Returns the options for requesting the teams on the teams directory,
 * by parsing the provided query parameters.
 */
export function getTeamsDirectoryRequestOptionsFromQuery(
  queryParams: ParsedUrlQuery
): IListOptions {
  const { sort, industry, fundingVehicle, fundingStage, searchBy, technology } =
    queryParams;

  return {
    sort: [getSortFromQuery(sort?.toString())],
    filterByFormula: getTeamsDirectoryFormula({
      industry,
      fundingVehicle,
      fundingStage,
      searchBy,
      technology,
    }),
  };
}

/**
 * Returns the options for requesting the members on the members directory,
 * by parsing the provided query parameters.
 */
export function getMembersDirectoryRequestOptionsFromQuery(
  queryParams: ParsedUrlQuery
): IListOptions {
  const { sort, searchBy } = queryParams;

  return {
    sort: [getSortFromQuery(sort?.toString())],
    filterByFormula: getMembersDirectoryFormula({ searchBy }),
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
 * Get formula for teams directory filtering.
 */
function getTeamsDirectoryFormula({
  industry,
  fundingVehicle,
  fundingStage,
  searchBy,
  technology,
}: {
  [key: string]: string | string[] | undefined;
}) {
  const formula = [
    'AND(',
    [
      '{Name} != ""',
      '{Short description} != ""',
      ...(searchBy ? [getSearchFormulaFromQuery(searchBy)] : []),
      ...(industry ? [getFieldFromQuery('Industry', industry)] : []),
      ...(fundingVehicle
        ? [getFieldFromQuery('Funding Vehicle', fundingVehicle)]
        : []),
      ...(fundingStage
        ? [getFieldFromQuery('Funding Stage', fundingStage)]
        : []),
      ...(technology ? [getTechnologyFormulaFromQuery(technology)] : []),
    ].join(', '),
    ')',
  ].join('');

  return formula;
}

/**
 * Get formula for members directory filtering.
 */
function getMembersDirectoryFormula({
  searchBy,
}: {
  [key: string]: string | string[] | undefined;
}) {
  const formula = [
    'AND(',
    [
      '{Name} != ""',
      '{Teams} != ""',
      ...(searchBy ? [getSearchFormulaFromQuery(searchBy)] : []),
    ].join(', '),
    ')',
  ].join('');

  return formula;
}

/**
 * Returns formula to find matching results with names starting with the
 * provided search query parameter.
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

/**
 * Get the Airtable technology filtering formulas.
 */
function getTechnologyFormulaFromQuery(
  technologyQuery: string | string[] = []
) {
  const values = Array.isArray(technologyQuery)
    ? technologyQuery
    : technologyQuery.split(URL_QUERY_VALUE_SEPARATOR);

  return values.map((value) => `{${value} User} = TRUE()`).join(', ');
}
