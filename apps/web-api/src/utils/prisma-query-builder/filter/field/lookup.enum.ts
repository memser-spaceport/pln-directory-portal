export enum LookupFilter {
  EXACT = 'exact',
  CONTAINS = 'contains',
  ICONTAINS = 'icontains',
  GT = 'gt',
  GTE = 'gte',
  LT = 'lt',
  LTE = 'lte',
  STARTS_WITH = 'startswith',
  ENDS_WITH = 'endswith',
  ISTARTS_WITH = 'istartswith',
  IENDS_WITH = 'iendswith',
  IN = 'in',
  WITH = 'with',
  BETWEEN = 'between',
  NOT = 'not',
}

export enum LookupDelimiter {
  LOOKUP_DELIMITER = '__',
  RELATION_DELIMITER = '.',
}
