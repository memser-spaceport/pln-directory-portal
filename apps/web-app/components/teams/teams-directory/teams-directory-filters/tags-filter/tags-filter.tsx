import { DirectoryTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface TagsFilterProps {
  tagsTags: IFilterTag[];
}

export function TagsFilter({ tagsTags }: TagsFilterProps) {
  const [tags, toggleTag] = useTagsFilter('tags', tagsTags);

  return (
    <DirectoryTagsFilter title="Tags" tags={tags} onTagToggle={toggleTag} />
  );
}
