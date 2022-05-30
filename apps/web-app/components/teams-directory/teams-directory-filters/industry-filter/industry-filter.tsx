import { IFilterTag } from '../../../../components/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../components/directory/directory-filters/directory-tags-filter/use-tags-filter.hook';
import DirectoryTagsFilter from '../../../directory/directory-filters/directory-tags-filter/directory-tags-filter';

export interface IndustryFilterProps {
  industryTags: IFilterTag[];
}

function IndustryFilter({ industryTags }: IndustryFilterProps) {
  const [tags, toggleTag] = useTagsFilter('industry', industryTags);

  return (
    <DirectoryTagsFilter title="Industry" tags={tags} onTagToggle={toggleTag} />
  );
}

export default IndustryFilter;
