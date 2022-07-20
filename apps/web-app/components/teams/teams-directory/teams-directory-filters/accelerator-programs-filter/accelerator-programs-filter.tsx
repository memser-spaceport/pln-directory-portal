import { DirectoryTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface AcceleratorProgramsFilterProps {
  acceleratorProgramsTags: IFilterTag[];
}

export function AcceleratorProgramsFilter({
  acceleratorProgramsTags,
}: AcceleratorProgramsFilterProps) {
  const [tags, toggleTag] = useTagsFilter(
    'acceleratorPrograms',
    acceleratorProgramsTags
  );

  return (
    <DirectoryTagsFilter
      title="Accelerator Programs"
      tags={tags}
      onTagToggle={toggleTag}
    />
  );
}
