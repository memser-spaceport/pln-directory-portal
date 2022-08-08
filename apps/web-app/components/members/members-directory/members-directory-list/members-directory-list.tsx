import { IMember } from '@protocol-labs-network/api';
import { MemberCard } from '../../../../components/shared/members/member-card/member-card';
import { DirectoryList } from '../../../directory/directory-list/directory-list';

interface MembersDirectoryListProps {
  members: IMember[];
  isGrid: boolean;
}

export function MembersDirectoryList({
  members,
  isGrid,
}: MembersDirectoryListProps) {
  return (
    <DirectoryList
      filterProperties={[
        'skills',
        'region',
        'country',
        'metroArea',
        'officeHoursOnly',
        'includeFriends',
        'searchBy',
      ]}
      itemsCount={members.length}
    >
      {members.map((member) => (
        <MemberCard key={member.id} member={member} isGrid={isGrid} />
      ))}
    </DirectoryList>
  );
}
