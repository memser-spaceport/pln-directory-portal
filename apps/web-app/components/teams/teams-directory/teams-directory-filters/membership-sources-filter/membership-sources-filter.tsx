import { DirectoryTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../shared/directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

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
      title="Membership Source"
      tags={tags}
      onTagToggle={toggleTag}
    />
  );
}
