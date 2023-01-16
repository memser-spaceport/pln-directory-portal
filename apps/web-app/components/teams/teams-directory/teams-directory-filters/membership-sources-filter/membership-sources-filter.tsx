import { DirectoryTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface MembershipSourcesFilterProps {
  membershipSourcesTags: IFilterTag[];
}

export function MembershipSourcesFilter({
  membershipSourcesTags,
}: MembershipSourcesFilterProps) {
  const [tags, toggleTag] = useTagsFilter(
    'membershipSources',
    membershipSourcesTags
  );

  return (
    <DirectoryTagsFilter
      title="Membership Sources"
      tags={tags}
      onTagToggle={toggleTag}
    />
  );
}
