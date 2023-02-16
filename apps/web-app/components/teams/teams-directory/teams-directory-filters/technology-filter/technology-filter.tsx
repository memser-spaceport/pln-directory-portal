import { DirectoryTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface TechnologyFilterProps {
  technologyTags: IFilterTag[];
}

export function TechnologyFilter({ technologyTags }: TechnologyFilterProps) {
  const [tags, toggleTag] = useTagsFilter('technology', technologyTags);

  return (
    <DirectoryTagsFilter
      title="Technology"
      tags={tags}
      onTagToggle={toggleTag}
    />
  );
}
