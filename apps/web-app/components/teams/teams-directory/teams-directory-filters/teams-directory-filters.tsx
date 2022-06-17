import DirectoryFilters from '../../../directory/directory-filters/directory-filters';
import FundingStageFilter from './funding-stage-filter/funding-stage-filter';
import FundingVehicleFilter from './funding-vehicle-filter/funding-vehicle-filter';
import IndustryFilter from './industry-filter/industry-filter';
import { ITeamsFiltersValues } from './teams-directory-filters.types';
import TechnologyFilter from './technology-filter/technology-filter';

export interface TeamsDirectoryFiltersProps {
  filtersValues: ITeamsFiltersValues;
}

function TeamsDirectoryFilters({ filtersValues }: TeamsDirectoryFiltersProps) {
  return (
    <DirectoryFilters
      filterProperties={[
        'industry',
        'fundingStage',
        'fundingVehicle',
        'technology',
      ]}
    >
      <IndustryFilter industryTags={filtersValues.industry} />
      <div className="h-px bg-slate-200 my-5" />
      <FundingVehicleFilter fundingVehicleTags={filtersValues.fundingVehicle} />
      <div className="h-px bg-slate-200 my-5" />
      <FundingStageFilter fundingStageTags={filtersValues.fundingStage} />
      <div className="h-px bg-slate-200 my-5" />
      <TechnologyFilter technologyTags={filtersValues.technology} />
    </DirectoryFilters>
  );
}

export default TeamsDirectoryFilters;
