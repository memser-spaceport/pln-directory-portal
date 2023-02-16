import { DirectoryTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface MetroAreaFilterProps {
  metroAreaTags: IFilterTag[];
}

export function MetroAreaFilter({ metroAreaTags }: MetroAreaFilterProps) {
  const [tags, toggleTag] = useTagsFilter('metroArea', metroAreaTags);

  return (
    <DirectoryTagsFilter
      title="Metro Area"
      tags={tags}
      onTagToggle={toggleTag}
    />
  );
}
