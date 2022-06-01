import FundingStageFilter from '../../../components/teams-directory/teams-directory-filters/funding-stage-filter/funding-stage-filter';
import FundingVehicleFilter from '../../../components/teams-directory/teams-directory-filters/funding-vehicle-filter/funding-vehicle-filter';
import { ITeamsFiltersValues } from '../../../components/teams-directory/teams-directory-filters/teams-directory-filters.types';
import DirectoryFilters from '../../directory/directory-filters/directory-filters';
import IndustryFilter from './industry-filter/industry-filter';

export interface TeamsDirectoryFiltersProps {
  filtersValues: ITeamsFiltersValues;
}

function TeamsDirectoryFilters({ filtersValues }: TeamsDirectoryFiltersProps) {
  return (
    <DirectoryFilters
      filterProperties={['industry', 'fundingStage', 'fundingVehicle']}
    >
      <IndustryFilter industryTags={filtersValues.industry} />
      <div className="h-px bg-slate-200 my-5" />
      <FundingVehicleFilter fundingVehicleTags={filtersValues.fundingVehicle} />
      <div className="h-px bg-slate-200 my-5" />
      <FundingStageFilter fundingStageTags={filtersValues.fundingStage} />
    </DirectoryFilters>
  );
}

export default TeamsDirectoryFilters;
