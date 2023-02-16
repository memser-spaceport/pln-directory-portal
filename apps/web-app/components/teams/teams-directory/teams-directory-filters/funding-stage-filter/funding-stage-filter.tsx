import { DirectoryTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface FundingStageFilterProps {
  fundingStageTags: IFilterTag[];
}

export function FundingStageFilter({
  fundingStageTags,
}: FundingStageFilterProps) {
  const [tags, toggleTag] = useTagsFilter('fundingStage', fundingStageTags);

  return (
    <DirectoryTagsFilter
      title="Funding Stage"
      tags={tags}
      onTagToggle={toggleTag}
    />
  );
}
