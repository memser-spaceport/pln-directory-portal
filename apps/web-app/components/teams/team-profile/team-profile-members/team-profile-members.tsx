import { UserIcon } from '@heroicons/react/solid';
import { useRouter } from 'next/router';
import { IMember } from '../../../../utils/members.types';
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
      {members.map((member) => {
        const team = member.teams.find((team) => team.id === id);

        return (
          <ProfileCard
            key={`${id}.${member.id}`}
            url={`/members/${member?.id}`}
            isImageRounded
            imageUrl={member.image}
            avatarIcon={UserIcon}
            name={member.name}
            showTeamLeadBadge={member.teamLead}
            description={team.role}
            tags={member.skills.map((skill) => skill.title)}
          />
        );
      })}
    </ProfileCards>
  );
}
