import has from 'lodash/has';
import set from 'lodash/set';
import get from 'lodash/get';
import mergeWith from 'lodash/mergeWith';
import isString from 'lodash/isString';
import isArray from 'lodash/isArray';

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
          ? this.prop
              .replace(/\./g, '.none.')
              .replace(
                /(?<last>\.none\..*)(\.none\.)(?<field>\w+)$/,
                '$1.is.$3'
              )
          : this.prop
              .replace(/\./g, '.some.')
              .replace(
                /(?<last>\.some\..*)(\.some\.)(?<field>\w+)$/,
                '$1.is.$3'
              );

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
      const hasInclusiveLookup = 'AND' in queryToAdd;
      const hasMultiValueLookup =
        typeof prismaQueryValue === 'string' && prismaQueryValue.includes(',');

      // Build either a "multi-value-NOT-condition"
      // (with an inclusive/exclusive nature)
      // or a "single-value-NOT-condition"
      queryToAdd = hasMultiValueLookup
        ? {
            [hasInclusiveLookup ? 'AND' : 'OR']: prismaQueryValue
              .split(',')
              .map((val) => ({
                NOT: set(
                  {},
                  prismaQueryPath,
                  this.fieldToBeQueriedIsNumeric ? +val : val
                ),
              })),
          }
        : {
            NOT: set({}, prismaQueryPath, prismaQueryValue),
          };
    }

    // Merge all conditions to be added:
    if (Object.keys(queryToAdd).length) {
      this.query['where'] = mergeWith(
        this.query['where'],
        queryToAdd,
        (objValue, srcValue) => {
          if (isArray(objValue) && isArray(srcValue)) {
            return [...objValue, ...srcValue];
          }
        }
      );

      // Group multiple independent NOT conditions
      // with single values inside an AND operator:
      if (
        'NOT' in this.query['where'] &&
        Object.keys(this.query['where'].NOT).length > 1
      ) {
        this.query['where'].AND = [
          ...(this.query['where']?.AND || []),
          ...Object.entries(this.query['where'].NOT).reduce(
            (conditions, condition: any) => {
              return [
                ...conditions,
                { NOT: Object.fromEntries(new Map([condition])) },
              ];
            },
            []
          ),
        ];
        delete this.query['where']['NOT'];
      }
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
