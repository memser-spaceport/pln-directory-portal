import { DirectoryTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface CountryFilterProps {
  countryTags: IFilterTag[];
}

export function CountryFilter({ countryTags }: CountryFilterProps) {
  const [tags, toggleTag] = useTagsFilter('country', countryTags);

  return (
    <DirectoryTagsFilter title="Country" tags={tags} onTagToggle={toggleTag} />
  );
}
