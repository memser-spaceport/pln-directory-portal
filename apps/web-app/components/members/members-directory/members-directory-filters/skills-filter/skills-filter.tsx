import { DirectoryTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface SkillsFilterProps {
  skillsTags: IFilterTag[];
}

export function SkillsFilter({ skillsTags }: SkillsFilterProps) {
  const [tags, toggleTag] = useTagsFilter('skills', skillsTags);

  return (
    <DirectoryTagsFilter title="Skills" tags={tags} onTagToggle={toggleTag} />
  );
}
