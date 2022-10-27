import has from 'lodash/has';
import set from 'lodash/set';
import get from 'lodash/get';
import isString from 'lodash/isString';

import { LOOKUP_FILTER_MAP } from './field-filter-map';
import { AbstractFilter } from '../filter';
import { PrismaQueryableFields } from '../../prisma-fields';
import { LookupFilter } from './lookup.enum';
import { PrismaQuery } from '../../prisma-query';

interface FilterConfig {
  query: PrismaQuery;
  prop: string;
  lookup: LookupFilter;
  value: string;
  notOperator: boolean;
  fields: PrismaQueryableFields;
}

export class FieldFilter extends AbstractFilter {
  private notOperator: boolean;
  private fieldToBeQueriedHasMany: boolean;
  private fieldToBeQueriedIsNullable: boolean;
  private fieldToBeQueriedIsNumeric: boolean;
  private fieldToBeQueriedIsBoolean: boolean;
  private fieldToBeQueriedIsRelational: boolean;
  private fieldToBeQueriedComesFromMany: boolean;

  constructor(config: FilterConfig) {
    super(
      config.query,
      config.prop,
      config.lookup,
      config.value,
      config.fields
    );
    this.notOperator = config.notOperator;

    const isNestedField = config.prop.includes('.');
    const parentFieldToBeQueried = isNestedField
      ? config.fields[config.prop.split('.')[0]]
      : undefined;
    const fieldToBeQueried = isNestedField
      ? get(config.fields, config.prop)
      : config.fields[config.prop];

    this.fieldToBeQueriedIsNullable =
      typeof fieldToBeQueried === 'object' &&
      fieldToBeQueried?._nullable === true;
    this.fieldToBeQueriedIsNumeric =
      typeof fieldToBeQueried === 'object' &&
      fieldToBeQueried?._type === 'number';
    this.fieldToBeQueriedIsBoolean =
      typeof fieldToBeQueried === 'object' &&
      fieldToBeQueried?._type === 'boolean';
    this.fieldToBeQueriedHasMany =
      typeof fieldToBeQueried === 'object' && fieldToBeQueried?._many === true;
    this.fieldToBeQueriedComesFromMany =
      typeof parentFieldToBeQueried === 'object' &&
      parentFieldToBeQueried?._many === true;
    this.fieldToBeQueriedIsRelational =
      typeof fieldToBeQueried === 'object' &&
      !!Object.keys(fieldToBeQueried).filter((key) => !key.includes('_'))
        .length;
  }

  public buildQuery(): void {
    const hasUnexistingField = !has(this.fields, this.prop);
    const hasInvalidNumericLookup =
      this.fieldToBeQueriedIsNumeric && isNaN(+this.value.split(',')[0]);
    const hasInvalidRelationalLookup =
      this.fieldToBeQueriedIsRelational && this.value !== 'null';

    if (
      hasUnexistingField ||
      hasInvalidNumericLookup ||
      hasInvalidRelationalLookup
    ) {
      return;
    }

    let queryToAdd: PrismaQuery['where'] = {};
    queryToAdd = this.setQuery(queryToAdd);

    if (this.notOperator && isString(this.value)) {
      const prismaQueryPath =
        !this.fieldToBeQueriedComesFromMany && !this.fieldToBeQueriedHasMany
          ? this.prop
          : this.value === 'null' && this.fieldToBeQueriedIsNullable
          ? this.prop.replace(/\./g, '.none.')
          : this.prop.replace(/\./g, '.some.');

      const prismaQueryValue = [
        {
          is: queryToAdd[this.prop],
          when: this.prop in queryToAdd && !!queryToAdd[this.prop],
        },
        {
          is: +this.value,
          when: this.fieldToBeQueriedIsNumeric && !isNaN(+this.value),
        },
        {
          is: null,
          when: this.value === 'null' && this.fieldToBeQueriedIsNullable,
        },
        {
          is: { none: {} },
          when: this.value === 'null' && this.fieldToBeQueriedHasMany,
        },
        {
          is: this.value === 'true',
          when: this.fieldToBeQueriedIsBoolean,
        },
        {
          is: this.value,
          when: this.value !== 'null' || !this.fieldToBeQueriedIsNullable,
        },
      ].find((condition) => !!condition.when)?.is;

      queryToAdd = {
        NOT: set({}, prismaQueryPath, prismaQueryValue),
      };
    }

    if (Object.keys(queryToAdd).length) {
      this.query['where'] = {
        ...this.query['where'],
        ...queryToAdd,
      };
    }
  }

  private setQuery(queryToAdd: PrismaQuery) {
    return (
      LOOKUP_FILTER_MAP.get(this.lookup)?.build({
        prop: this.prop,
        value: this.value,
        nullable: this.fieldToBeQueriedIsNullable,
        numeric: this.fieldToBeQueriedIsNumeric,
        boolean: this.fieldToBeQueriedIsBoolean,
        fromMany: this.fieldToBeQueriedComesFromMany,
        hasMany: this.fieldToBeQueriedHasMany,
        isRelational: this.fieldToBeQueriedIsRelational,
      }) || queryToAdd
    );
  }
}
