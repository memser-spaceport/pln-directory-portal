import { IListOptions, TListSortDirection } from '@protocol-labs-network/api';
import { ParsedUrlQuery } from 'querystring';
import {
  directorySortOptions,
  TDirectorySortOption,
} from '../../components/directory/directory-sort/directory-sort.types';
import { MEMBER_CARD_FIELDS } from '../../components/shared/members/member-card/member-card.constants';
import { TEAM_CARD_FIELDS } from '../../components/shared/teams/team-card/team-card.constants';
import { ITEMS_PER_PAGE, URL_QUERY_VALUE_SEPARATOR } from '../../constants';

/**
 * Returns the options for requesting the teams on the teams directory,
 * based on the provided query parameters.
 */
export function getTeamsDirectoryRequestOptionsFromQuery(
  queryParams: ParsedUrlQuery
): IListOptions {
  const {
    sort,
    tags,
    acceleratorPrograms,
    fundingStage,
    searchBy,
    technology,
  } = queryParams;

  return {
    sort: [getSortFromQuery(sort?.toString())],
    filterByFormula: getTeamsDirectoryFormula({
      tags,
      acceleratorPrograms,
      fundingStage,
      searchBy,
      technology,
    }),
  };
}

/**
 * Get the options for requesting the teams on the teams directory.
 */
export function getTeamsDirectoryListOptions(
  options: IListOptions
): IListOptions {
  return {
    ...options,
    fields: TEAM_CARD_FIELDS,
    pageSize: ITEMS_PER_PAGE,
  };
}

/**
 * Returns the options for requesting the members on the members directory,
 * based on the provided query parameters.
 */
export function getMembersDirectoryRequestOptionsFromQuery(
  queryParams: ParsedUrlQuery
): IListOptions {
  const { sort, searchBy, skills, country, metroArea } = queryParams;

  return {
    sort: [getSortFromQuery(sort?.toString())],
    filterByFormula: getMembersDirectoryFormula({
      searchBy,
      skills,
      country,
      metroArea,
    }),
  };
}

/**
 * Get the options for requesting the members on the members directory.
 */
export function getMembersDirectoryListOptions(
  options: IListOptions
): IListOptions {
  return {
    ...options,
    fields: MEMBER_CARD_FIELDS,
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
  tags,
  acceleratorPrograms,
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
      ...(tags ? [getFieldFromQuery('Tags lookup', tags, true)] : []),
      ...(acceleratorPrograms
        ? [getFieldFromQuery('Accelerator Programs', acceleratorPrograms)]
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
  skills,
  country,
  metroArea,
}: {
  [key: string]: string | string[] | undefined;
}) {
  const formula = [
    'AND(',
    [
      '{Name} != ""',
      '{Teams} != ""',
      ...(searchBy ? [getSearchFormulaFromQuery(searchBy)] : []),
      ...(skills ? [getFieldFromQuery('Skills', skills)] : []),
      ...(country ? [getFieldFromQuery('Country', country)] : []),
      ...(metroArea ? [getFieldFromQuery('Metro Area', metroArea)] : []),
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
  queryValue: string | string[] = [],
  isLookupField = false
) {
  const values = Array.isArray(queryValue)
    ? queryValue
    : queryValue.split(URL_QUERY_VALUE_SEPARATOR);
  const whereToSearch = isLookupField
    ? `ARRAYJOIN({${fieldName}})`
    : `{${fieldName}}`;
  const valuesFormulas = values.map(
    (value) => `SEARCH("${value}", ${whereToSearch})`
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
