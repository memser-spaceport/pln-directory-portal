import { IFilterTag } from '../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';

export interface ITeamsFiltersValues {
  tags: IFilterTag[];
  membershipSources: IFilterTag[];
  fundingStage: IFilterTag[];
  technology: IFilterTag[];
  focusAreas: any;
}
