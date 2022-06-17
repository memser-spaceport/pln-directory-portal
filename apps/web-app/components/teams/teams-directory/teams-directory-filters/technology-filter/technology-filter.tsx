import DirectoryTagsFilter from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface TechnologyFilterProps {
  technologyTags: IFilterTag[];
}

function TechnologyFilter({ technologyTags }: TechnologyFilterProps) {
  const [tags, toggleTag] = useTagsFilter('technology', technologyTags);

  return (
    <DirectoryTagsFilter
      title="Technology"
      tags={tags}
      onTagToggle={toggleTag}
    />
  );
}

export default TechnologyFilter;
