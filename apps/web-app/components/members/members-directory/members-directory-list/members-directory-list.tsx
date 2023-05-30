import { IMember } from '../../../../utils/members.types';
import { DirectoryList } from '../../../shared/directory/directory-list/directory-list';
import { MemberCard } from '../member-card/member-card';

interface MembersDirectoryListProps {
  members: IMember[];
  isGrid: boolean;
  filterProperties: string[];
  loggedInMember: any;
}

export function MembersDirectoryList({
  members,
  isGrid,
  filterProperties,
  loggedInMember,
}: MembersDirectoryListProps) {
  return (
    <DirectoryList
      filterProperties={filterProperties}
      itemsCount={members.length}
    >
      {members.map((member) => (
        <MemberCard
          key={member.id}
          member={member}
          isGrid={isGrid}
          loggedInMember={loggedInMember}
        />
      ))}
    </DirectoryList>
  );
}
