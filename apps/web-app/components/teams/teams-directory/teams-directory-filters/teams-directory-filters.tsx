import { DirectoryFilters } from '../../../directory/directory-filters/directory-filters';
import { FundingStageFilter } from './funding-stage-filter/funding-stage-filter';
import { FundingVehicleFilter } from './funding-vehicle-filter/funding-vehicle-filter';
import { TagsFilter } from './tags-filter/tags-filter';
import { ITeamsFiltersValues } from './teams-directory-filters.types';
import { TechnologyFilter } from './technology-filter/technology-filter';

export interface TeamsDirectoryFiltersProps {
  filtersValues: ITeamsFiltersValues;
}

export function TeamsDirectoryFilters({
  filtersValues,
}: TeamsDirectoryFiltersProps) {
  return (
    <DirectoryFilters
      filterProperties={[
        'tags',
        'fundingStage',
        'fundingVehicle',
        'technology',
      ]}
    >
      <TagsFilter tagsTags={filtersValues.tags} />
      <div className="my-5 h-px bg-slate-200" />
      <FundingVehicleFilter fundingVehicleTags={filtersValues.fundingVehicle} />
      <div className="my-5 h-px bg-slate-200" />
      <FundingStageFilter fundingStageTags={filtersValues.fundingStage} />
      <div className="my-5 h-px bg-slate-200" />
      <TechnologyFilter technologyTags={filtersValues.technology} />
    </DirectoryFilters>
  );
}
