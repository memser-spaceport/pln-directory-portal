import { IFilterTag } from '../../../../components/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../components/directory/directory-filters/directory-tags-filter/use-tags-filter.hook';
import DirectoryTagsFilter from '../../../directory/directory-filters/directory-tags-filter/directory-tags-filter';

export interface FundingStageFilterProps {
  fundingStageTags: IFilterTag[];
}

function FundingStageFilter({ fundingStageTags }: FundingStageFilterProps) {
  const [tags, toggleTag] = useTagsFilter('fundingStage', fundingStageTags);

  return (
    <DirectoryTagsFilter
      title="Funding Stage"
      tags={tags}
      onTagToggle={toggleTag}
    />
  );
}

export default FundingStageFilter;
