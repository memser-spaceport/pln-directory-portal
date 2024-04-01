import { DirectoryFilters } from '../../../shared/directory/directory-filters/directory-filters';
import { FriendOfPLNFilter } from '../../../shared/directory/directory-filters/friend-of-pln-filter/friend-of-pln-filter';
import { FundingStageFilter } from './funding-stage-filter/funding-stage-filter';
import { MembershipSourcesFilter } from './membership-sources-filter/membership-sources-filter';
import { TagsFilter } from './tags-filter/tags-filter';
import { FocusAreaFilter } from './focus-area-filter/focus-area-filter';
import { ITeamsFiltersValues } from './teams-directory-filters.types';
import { TechnologyFilter } from './technology-filter/technology-filter';

export interface TeamsDirectoryFiltersProps {
  filtersValues: ITeamsFiltersValues;
  filterProperties: string[];
}

export function TeamsDirectoryFilters({
  filtersValues,
  filterProperties,
}: TeamsDirectoryFiltersProps) {
  return (
    <DirectoryFilters filterProperties={filterProperties}>
      <FriendOfPLNFilter />
      <div className="my-5 h-px bg-slate-200" />
      <FocusAreaFilter focusArea={filtersValues.focusAreas}/>
      <div className="my-5 h-px bg-slate-200" />
      <TagsFilter tagsTags={filtersValues.tags} />
      <div className="my-5 h-px bg-slate-200" />
      <MembershipSourcesFilter
        membershipSourcesTags={filtersValues.membershipSources}
      />
      <div className="my-5 h-px bg-slate-200" />
      <FundingStageFilter fundingStageTags={filtersValues.fundingStage} />
      <div className="my-5 h-px bg-slate-200" />
      <TechnologyFilter technologyTags={filtersValues.technology} />
    </DirectoryFilters>
  );
}
