import { ConfigProfile } from '../../profile/config-profile';
import { FilterOption, FilterOptionQuery } from './filter-option';
import isNumber from 'lodash/isNumber';

/**
 * Pagination:
 * https://www.prisma.io/docs/concepts/components/prisma-client/pagination
 */
export class PaginationOption implements FilterOption {
  public setOption(query: FilterOptionQuery, profile: ConfigProfile): void {
    const { itemsPerPage } = profile.options.pagination;

    if (!this.isAuthorized(profile)) {
      delete query.source['pagination'];
      delete query.source['page'];
      delete query.source['limit'];
      return;
    }

    const hasPaginationEnabled =
      query.source['pagination'] === undefined ||
      query.source['pagination'] === 'true';
    const hasValidPage =
      query.source['page'] &&
      typeof query.source['page'] === 'string' &&
      isNumber(+query.source['page']) &&
      Number(query.source['page']) > 1 &&
      Number.isInteger(+query.source['page']);
    const hasValidLimit =
      query.source['limit'] &&
      typeof query.source['limit'] === 'string' &&
      isNumber(+query.source['limit']) &&
      Number(query.source['limit']) > 0 &&
      Number.isInteger(+query.source['limit']);

    if (hasPaginationEnabled) {
      query.target['skip'] = hasValidPage
        ? (Number(query.source['page']) - 1) *
          (Number(query.source['limit']) || itemsPerPage)
        : 0;
      delete query.source['page'];
      query.target['take'] = hasValidLimit
        ? Number(query.source['limit'])
        : itemsPerPage;
      delete query.source['limit'];
    }
    delete query.source['pagination'];
  }

  public isAuthorized(profile: ConfigProfile): boolean {
    return profile.options.pagination.status !== 'disabled';
  }
}
