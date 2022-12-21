import isString from 'lodash/isString';
import { ConfigProfile } from '../../profile/config-profile';
import { BaseOption, FilterOption, FilterOptionQuery } from './filter-option';
import set from 'lodash/set';

export class RelationsOption extends BaseOption implements FilterOption {
  private paramKey = 'with';
  private queryKey = 'include';
  private additionalQueryKey = 'select';

  public setOption(query: FilterOptionQuery, profile: ConfigProfile): void {
    this.excludeInvalidQueryFields(query, this.paramKey, {
      allowNested: true,
      allowNestedForLists: true,
      onlyRelatedFields: true,
    });

    if (!this.isAuthorized(profile)) {
      delete query.source['with'];
      return;
    }
    if (!query.source['with'] || !isString(query.source['with'])) {
      return;
    }

    const relations = String(query.source['with']).split(',');
    const availableQueryKey =
      this.additionalQueryKey in query.target
        ? this.additionalQueryKey
        : this.queryKey;

    query.target[availableQueryKey] = {
      ...query.target[availableQueryKey],
      ...relations.reduce(
        (fields, currentField) => ({
          ...fields,
          ...(currentField.includes('.')
            ? set({}, currentField.replace(/\./g, '.include.'), true)
            : {
                [currentField]: true,
              }),
        }),
        {}
      ),
    };

    delete query.source['with'];
  }

  public isAuthorized(profile: ConfigProfile): boolean {
    return profile.options.relations.status !== 'disabled';
  }
}
