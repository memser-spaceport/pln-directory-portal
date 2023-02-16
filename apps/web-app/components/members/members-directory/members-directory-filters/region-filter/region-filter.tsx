import { DirectoryTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface RegionFilterProps {
  regionTags: IFilterTag[];
}

export function RegionFilter({ regionTags }: RegionFilterProps) {
  const [tags, toggleTag] = useTagsFilter('region', regionTags);

  return (
    <DirectoryTagsFilter title="Region" tags={tags} onTagToggle={toggleTag} />
  );
}
