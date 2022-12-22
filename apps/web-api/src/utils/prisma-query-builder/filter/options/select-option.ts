import { ConfigProfile } from '../../profile/config-profile';
import { BaseOption, FilterOption, FilterOptionQuery } from './filter-option';
import set from 'lodash/set';

export class SelectOption extends BaseOption implements FilterOption {
  private queryKey = 'select';

  public setOption(query: FilterOptionQuery, profile: ConfigProfile): void {
    this.excludeInvalidQueryFields(query, this.queryKey, {
      allowNested: true,
      allowNestedForLists: true,
    });

    if (!this.isAuthorized(profile)) {
      delete query.source[this.queryKey];
      return;
    }
    if (
      !(this.queryKey in query.source) ||
      typeof query.source[this.queryKey] !== 'string'
    ) {
      return;
    }

    const fields = (query.source[this.queryKey] as string).split(',');
    const selectedFields = fields.reduce(
      (fields, currentField) => ({
        ...fields,
        ...(currentField.includes('.')
          ? set(fields, currentField.replace(/\./g, '.select.'), true)
          : {
              [currentField]: true,
            }),
      }),
      {}
    );

    query.target[this.queryKey] =
      this.queryKey in query.target
        ? {
            ...query.target[this.queryKey],
            ...selectedFields,
          }
        : selectedFields;

    delete query.source[this.queryKey];
  }

  public isAuthorized(profile: ConfigProfile): boolean {
    return profile.options.select.status !== 'disabled';
  }
}
