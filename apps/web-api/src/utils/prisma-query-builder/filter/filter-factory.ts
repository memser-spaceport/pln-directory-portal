import isString from 'lodash/isString';
import { PrismaQueryableFields } from '../prisma-fields';
import { PrismaQuery } from '../prisma-query';
import { QueryString } from '../query-string';
import { FieldFilter } from './field/field-filter';
import { LookupDelimiter, LookupFilter } from './field/lookup.enum';
import { AbstractFilter } from './filter';

interface FilterFactoryQuery {
  query: PrismaQuery;
  key: string;
  value: QueryString[0];
  fields: PrismaQueryableFields;
}

export class FilterFactory {
  public get(query: FilterFactoryQuery): AbstractFilter | undefined {
    if (!query.value || !isString(query.value)) {
      return;
    }
    const prop = query.key.split(LookupDelimiter.LOOKUP_DELIMITER)[0];
    const notOperator = query.key.includes(
      `${LookupDelimiter.LOOKUP_DELIMITER}${LookupFilter.NOT}`
    );
    const lookup = query.key.includes(LookupDelimiter.LOOKUP_DELIMITER)
      ? (query.key.split(LookupDelimiter.LOOKUP_DELIMITER)[
          notOperator ? 2 : 1
        ] as LookupFilter)
      : LookupFilter.EXACT;
    return new FieldFilter({
      query: query.query,
      prop,
      lookup,
      value: String(query.value),
      notOperator,
      fields: query.fields,
    });
  }
}
