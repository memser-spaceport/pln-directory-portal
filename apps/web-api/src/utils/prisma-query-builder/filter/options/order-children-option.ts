import merge from 'lodash/merge';
import set from 'lodash/set';
import isString from 'lodash/isString';
import { ConfigProfile } from '../../profile/config-profile';
import { BaseOption, FilterOption, FilterOptionQuery } from './filter-option';

/**
 * Sorting:
 * https://www.prisma.io/docs/concepts/components/prisma-client/filtering-and-sorting#sorting
 */
export class OrderChildrenOption extends BaseOption implements FilterOption {
  private paramKey = 'order';
  private queryKey = 'include';
  private additionalQueryKey = 'select';

  public setOption(query: FilterOptionQuery, profile: ConfigProfile): void {
    this.excludeInvalidQueryFields(query, this.paramKey, {
      ignorePrefix: '-',
      allowNestedForLists: true,
    });

    if (!this.isAuthorized(profile)) {
      delete query.source[this.paramKey];
      return;
    }
    if (
      !query.source[this.paramKey] ||
      !isString(query.source[this.paramKey])
    ) {
      return;
    }

    // Grab order fields:
    const getFirstFieldName = (fieldPath) =>
      fieldPath.split('.')[0].replace('-', '');
    const orderFields = String(query.source[this.paramKey])
      .split(',')
      // Look only for nested fields:
      .filter((field) => field.includes('.'))
      // Filter by unique order fields:
      .filter((field, index, self) =>
        self.some(
          (someField) =>
            self.length === 1 ||
            getFirstFieldName(field) !== getFirstFieldName(someField) ||
            (field !== someField && self.indexOf(someField) > index)
        )
      );

    if (!orderFields.length) {
      delete query.target[this.queryKey];
      delete query.source[this.paramKey];
      return;
    }

    const availableQueryKey =
      this.additionalQueryKey in query.target
        ? this.additionalQueryKey
        : this.queryKey;

    for (const field of orderFields) {
      const nestedFields = field.split('.');
      const relatedField = nestedFields.shift() || '';
      const orderCriteria = this.getOrderCriteria(relatedField);
      const orderField =
        orderCriteria === 'asc'
          ? relatedField
          : relatedField.substring(1, relatedField.length);
      const orderQuery = {
        [orderField]: {
          orderBy: set({}, nestedFields, orderCriteria),
        },
      };
      query.target[availableQueryKey] = {
        ...query.target[availableQueryKey],
        ...merge(query.target[availableQueryKey], orderQuery),
      };
    }

    delete query.source[this.paramKey];
  }

  private getOrderCriteria(field: string): string {
    if (field.startsWith('-')) {
      return 'desc';
    }

    return 'asc';
  }

  public isAuthorized(profile: ConfigProfile): boolean {
    return profile.options.orderingChildren.status !== 'disabled';
  }
}
