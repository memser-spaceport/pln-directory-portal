import { DirectoryTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface RegionFilterProps {
  regionTags: IFilterTag[];
  userInfo?: any;
}

export function RegionFilter({ regionTags, userInfo }: RegionFilterProps) {
  const [tags, toggleTag] = useTagsFilter('region', regionTags);

  return (
      <DirectoryTagsFilter title="Region" tags={tags} onTagToggle={toggleTag} hideOnLogout={true} userInfo={userInfo}/>
  );
}
