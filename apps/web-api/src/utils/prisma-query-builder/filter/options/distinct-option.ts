import { ConfigProfile } from '../../profile/config-profile';
import { BaseOption, FilterOption, FilterOptionQuery } from './filter-option';

/**
 * https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#distinct
 */
export class DistinctOption extends BaseOption implements FilterOption {
  private paramKey = 'distinct';

  public setOption(query: FilterOptionQuery, profile: ConfigProfile): void {
    this.excludeInvalidQueryFields(query, this.paramKey);

    if (!this.isAuthorized(profile)) {
      delete query.source[this.paramKey];
      return;
    }
    if (!query.source[this.paramKey]) {
      return;
    }

    // Grab distinct fields:
    const distinctFields = String(query.source[this.paramKey]).split(',');

    // Set distinct fields:
    query.target.distinct = distinctFields;

    // Remove distinct fields from query:
    delete query.source[this.paramKey];

    // If there are no fields to distinct, remove the distinct option:
    if (query.target.distinct.length === 0) {
      delete query.target.distinct;
    }
  }

  public isAuthorized(profile: ConfigProfile): boolean {
    return profile.options.distinct.status !== 'disabled';
  }
}
