import { UserIcon } from '@heroicons/react/solid';
import { IMember } from '@protocol-labs-network/api';
import { useRouter } from 'next/router';
import { ProfileCard } from '../../../shared/profile/profile-cards/profile-card';
import { ProfileCards } from '../../../shared/profile/profile-cards/profile-cards';

interface TeamProfileMembersProps {
  members: IMember[];
}

export function TeamProfileMembers({ members }: TeamProfileMembersProps) {
  const {
    query: { id },
  } = useRouter();

  return (
    <ProfileCards title="Members" count={members.length}>
      {members.map((member) => (
        <ProfileCard
          key={`${id}.${member.id}`}
          url={`/members/${member?.id}`}
          isImageRounded
          imageUrl={member.image}
          avatarIcon={UserIcon}
          name={member.name}
          showTeamLeadBadge={member.teamLead}
          description={member.role}
          tags={member.teams.map(({ name }) => name)}
        />
      ))}
    </ProfileCards>
  );
}
