import { FriendOfPLNFilter } from '../../../../components/directory/directory-filters/friend-of-pln-filter/friend-of-pln-filter';
import { DirectoryFilters } from '../../../directory/directory-filters/directory-filters';
import { AcceleratorProgramsFilter } from './accelerator-programs-filter/accelerator-programs-filter';
import { FundingStageFilter } from './funding-stage-filter/funding-stage-filter';
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
        'acceleratorPrograms',
        'fundingStage',
        'technology',
        'includeFriends',
      ]}
    >
      <FriendOfPLNFilter />
      <div className="my-5 h-px bg-slate-200" />
      <TagsFilter tagsTags={filtersValues.tags} />
      <div className="my-5 h-px bg-slate-200" />
      <AcceleratorProgramsFilter
        acceleratorProgramsTags={filtersValues.acceleratorPrograms}
      />
      <div className="my-5 h-px bg-slate-200" />
      <FundingStageFilter fundingStageTags={filtersValues.fundingStage} />
      <div className="my-5 h-px bg-slate-200" />
      <TechnologyFilter technologyTags={filtersValues.technology} />
    </DirectoryFilters>
  );
}
