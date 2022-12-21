import { PrismaQuery } from '../../prisma-query';
import { QueryString } from '../../query-string';
import { ConfigProfile } from '../../profile/config-profile';
import { PrismaQueryableFields } from '../../prisma-fields';
import get from 'lodash/get';
import has from 'lodash/has';
import unset from 'lodash/unset';

export interface FilterOptionQuery {
  source: QueryString;
  target: PrismaQuery;
  fields: PrismaQueryableFields;
}

export interface FilterOption {
  setOption(query: FilterOptionQuery, profile: ConfigProfile): void;
  isAuthorized(profile: ConfigProfile): boolean;
}

interface FilterValueExcludeOptions {
  allowNested?: boolean;
  allowNestedForLists?: boolean;
  ignorePrefix?: string;
  onlyPrimitiveFields?: boolean;
  onlyRelatedFields?: boolean;
}

export abstract class BaseOption {
  protected excludeInvalidQueryFields(
    query: FilterOptionQuery,
    optionKey: string,
    excludeOptions: FilterValueExcludeOptions = {
      allowNested: false,
      allowNestedForLists: false,
      onlyPrimitiveFields: false,
      onlyRelatedFields: false,
    }
  ): void {
    const optionValues = () => String(query.source[optionKey]).split(',');
    const hasJustOneField = () => optionValues().length === 1;
    const getFieldWithoutPrefix = (value: string) =>
      value.replace(excludeOptions?.ignorePrefix || '', '');
    const getFieldWithoutNestedValues = (value: string) =>
      value
        .split(',')
        .filter((field) => !field.includes('.'))
        .join(',');

    for (const valueField of optionValues()) {
      let fieldName = getFieldWithoutPrefix(valueField);
      if (
        excludeOptions.allowNested !== true &&
        excludeOptions.allowNestedForLists !== true
      ) {
        fieldName = getFieldWithoutNestedValues(fieldName);
      }
      if (
        excludeOptions.allowNestedForLists === true &&
        Array.isArray(query.fields[fieldName.split('.')[0]])
      ) {
        fieldName = fieldName.replace(/\./g, '[0].');
      }
      if (
        has(query.fields, fieldName) &&
        (excludeOptions.onlyPrimitiveFields !== true ||
          typeof get(query.fields, fieldName) === 'boolean' ||
          has(query.fields, `${fieldName}._type`)) &&
        (excludeOptions.onlyRelatedFields !== true ||
          (typeof get(query.fields, fieldName) !== 'boolean' &&
            !has(query.fields, `${fieldName}._type`)))
      ) {
        continue;
      }
      if (hasJustOneField()) {
        unset(query.source, optionKey);
        break;
      }
      query.source[optionKey] = String(query.source[optionKey])
        .split(',')
        .filter((field) => field !== valueField)
        .join(',');
    }
  }
}
