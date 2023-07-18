import { DirectoryTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface CountryFilterProps {
  countryTags: IFilterTag[];
  userInfo?: any;
}

export function CountryFilter({ countryTags, userInfo }: CountryFilterProps) {
  const [tags, toggleTag] = useTagsFilter('country', countryTags);

  return (
    <DirectoryTagsFilter title="Country" tags={tags} onTagToggle={toggleTag} hideOnLogout={true} userInfo={userInfo}/>
  );
}
