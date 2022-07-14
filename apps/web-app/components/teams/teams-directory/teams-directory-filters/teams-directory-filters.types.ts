import { IFilterTag } from '../../../directory/directory-filters/directory-tags-filter/directory-tags-filter.types';

export interface ITeamsFiltersValues {
  fundingStage: IFilterTag[];
  fundingVehicle: IFilterTag[];
  tags: IFilterTag[];
  technology: IFilterTag[];
}
