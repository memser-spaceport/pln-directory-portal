import set from 'lodash/set';
import uniqBy from 'lodash/uniqBy';
import { ConfigProfile } from '../../profile/config-profile';
import { BaseOption, FilterOption, FilterOptionQuery } from './filter-option';

/**
 * Sorting:
 * https://www.prisma.io/docs/concepts/components/prisma-client/filtering-and-sorting#sorting
 */
export class OrderOption extends BaseOption implements FilterOption {
  private queryKey = 'orderBy';

  public setOption(query: FilterOptionQuery, profile: ConfigProfile): void {
    this.excludeInvalidQueryFields(query, this.queryKey, {
      ignorePrefix: '-',
      allowNested: true,
      onlyPrimitiveFields: true,
    });

    if (!this.isAuthorized(profile)) {
      delete query.source[this.queryKey];
      return;
    }
    if (!query.source[this.queryKey]) {
      return;
    }

    // Initialize sorting rules:
    query.target[this.queryKey] = [];
    // Grab order fields into unique list:
    const uniqueFields = uniqBy(
      String(query.source[this.queryKey]).split(','),
      (field) => field.replace('-', '')
    );

    for (const field of uniqueFields) {
      const orderCriteria = this.getOrderCriteria(field);
      const orderField =
        orderCriteria === 'asc' ? field : field.substr(1, field.length);
      const fieldQuery = field.includes('.')
        ? set({}, orderField, orderCriteria)
        : { [orderField]: orderCriteria };
      query.target[this.queryKey].push(fieldQuery);
    }

    delete query.source[this.queryKey];
  }

  private getOrderCriteria(field: string): string {
    if (field.startsWith('-')) {
      return 'desc';
    }
    return 'asc';
  }

  public isAuthorized(profile: ConfigProfile): boolean {
    return profile.options.ordering.status !== 'disabled';
  }
}
