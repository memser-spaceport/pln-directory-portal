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
    includeFriends,
  } = queryParams;

  return {
    sort: [getSortFromQuery(sort?.toString())],
    filterByFormula: getTeamsDirectoryFormula({
      tags,
      acceleratorPrograms,
      fundingStage,
      searchBy,
      technology,
      includeFriends,
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
  };
}

/**
 * Returns the options for requesting the members on the members directory,
 * based on the provided query parameters.
 */
export function getMembersDirectoryRequestOptionsFromQuery(
  queryParams: ParsedUrlQuery
): IListOptions {
  const {
    sort,
    searchBy,
    skills,
    region,
    country,
    metroArea,
    officeHoursOnly,
    includeFriends,
  } = queryParams;

  return {
    sort: [getSortFromQuery(sort?.toString())],
    filterByFormula: getMembersDirectoryFormula({
      searchBy,
      skills,
      region,
      country,
      metroArea,
      officeHoursOnly,
      includeFriends,
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
 * Returns the query parameters string for requesting the teams on
 * the teams directory, by parsing the provided query parameters.
 */
export function getTeamsDirectoryRequestParametersFromQuery(
  queryParams: ParsedUrlQuery
): string {
  const {
    sort,
    tags,
    acceleratorPrograms,
    fundingStage,
    searchBy,
    technology,
    includeFriends,
  } = queryParams;

  const fieldsParam = TEAM_CARD_FIELDS.map((field) => `fields[]=${field}`).join(
    '&'
  );

  const sortFromQuery = getSortFromQuery(sort?.toString());
  const sortFieldParam = `sort[0][field]=${sortFromQuery.field}`;
  const sortDirectionParam = `sort[0][direction]=${sortFromQuery.direction}`;
  const sortParam = `${sortFieldParam}&${sortDirectionParam}`;

  const teamsDirectoryFormula = getTeamsDirectoryFormula({
    tags,
    acceleratorPrograms,
    fundingStage,
    searchBy,
    technology,
    includeFriends,
  });
  const encodedFormula = encodeURIComponent(teamsDirectoryFormula);
  const filterByFormulaParam = `filterByFormula=${encodedFormula}`;

  const pageSizeParam = `pageSize=${ITEMS_PER_PAGE}`;

  return `${fieldsParam}&${sortParam}&${filterByFormulaParam}&${pageSizeParam}`;
}

/**
 * Returns the query parameters string for requesting the members on
 * the members directory, by parsing the provided query parameters.
 */
export function getMembersDirectoryRequestParametersFromQuery(
  queryParams: ParsedUrlQuery
): string {
  const {
    sort,
    searchBy,
    skills,
    region,
    country,
    metroArea,
    officeHoursOnly,
    includeFriends,
  } = queryParams;

  const fieldsParam = MEMBER_CARD_FIELDS.map(
    (field) => `fields[]=${field}`
  ).join('&');

  const sortFromQuery = getSortFromQuery(sort?.toString());
  const sortFieldParam = `sort[0][field]=${sortFromQuery.field}`;
  const sortDirectionParam = `sort[0][direction]=${sortFromQuery.direction}`;
  const sortParam = `${sortFieldParam}&${sortDirectionParam}`;

  const membersDirectoryFormula = getMembersDirectoryFormula({
    searchBy,
    skills,
    region,
    country,
    metroArea,
    officeHoursOnly,
    includeFriends,
  });
  const encodedFormula = encodeURIComponent(membersDirectoryFormula);
  const filterByFormulaParam = `filterByFormula=${encodedFormula}`;

  const pageSizeParam = `pageSize=${ITEMS_PER_PAGE}`;

  return `${fieldsParam}&${sortParam}&${filterByFormulaParam}&${pageSizeParam}`;
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
  includeFriends,
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
      ...(includeFriends ? [] : ['{Friend of PLN} = FALSE()']),
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
  region,
  country,
  metroArea,
  officeHoursOnly,
  includeFriends,
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
      ...(region ? [getFieldFromQuery('Region', region)] : []),
      ...(country ? [getFieldFromQuery('Country', country)] : []),
      ...(metroArea ? [getFieldFromQuery('Metro Area', metroArea)] : []),
      ...(officeHoursOnly ? ['{Office hours link} != ""'] : []),
      ...(includeFriends ? [] : ['{Friend of PLN} = FALSE()']),
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
