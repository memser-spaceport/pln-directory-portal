import { DirectoryFilters } from '../../../shared/directory/directory-filters/directory-filters';
import { FriendOfPLNFilter } from '../../../shared/directory/directory-filters/friend-of-pln-filter/friend-of-pln-filter';
import { FundingStageFilter } from './funding-stage-filter/funding-stage-filter';
import { MembershipSourcesFilter } from './membership-sources-filter/membership-sources-filter';
import { OfficeHoursFilter } from './office-hours-filter/office-hours-filter';
import { TagsFilter } from './tags-filter/tags-filter';
import { ITeamsFiltersValues } from './teams-directory-filters.types';
import { TechnologyFilter } from './technology-filter/technology-filter';
import FocusAreaFilter from 'apps/web-app/components/shared/focus-area-filter/focus-area-filter';
import { FOCUS_AREAS_FILTER_KEYS } from 'apps/web-app/constants';

export interface TeamsDirectoryFiltersProps {
  filtersValues: ITeamsFiltersValues;
  filterProperties: string[];
}

export function TeamsDirectoryFilters({ filtersValues, filterProperties }: TeamsDirectoryFiltersProps) {
  return (
    <DirectoryFilters filterProperties={filterProperties}>
      <div className="space-y-4">
        <OfficeHoursFilter />
        <FriendOfPLNFilter />
      </div>
      <div className="my-5 h-px bg-slate-200" />
      <FocusAreaFilter
        title="Focus Area"
        uniqueKey={FOCUS_AREAS_FILTER_KEYS.teams}
        focusAreaRawData={filtersValues?.focusAreas?.rawData}
        selectedItems={filtersValues.focusAreas?.selectedFocusAreas}
      />
      <div className="my-5 h-px bg-slate-200" />
      <TagsFilter tagsTags={filtersValues.tags} />
      <div className="my-5 h-px bg-slate-200" />
      <MembershipSourcesFilter membershipSourcesTags={filtersValues.membershipSources} />
      <div className="my-5 h-px bg-slate-200" />
      <FundingStageFilter fundingStageTags={filtersValues.fundingStage} />
      <div className="my-5 h-px bg-slate-200" />
      <TechnologyFilter technologyTags={filtersValues.technology} />
    </DirectoryFilters>
  );
}
