import { IFilterTag } from '../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';

export interface IMembersFiltersValues {
  skills: IFilterTag[];
  region: IFilterTag[];
  country: IFilterTag[];
  metroArea: IFilterTag[];
  memberRoles: any;
}
