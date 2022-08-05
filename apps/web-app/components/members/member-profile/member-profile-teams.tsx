import { UserGroupIcon } from '@heroicons/react/solid';
import { ITeam } from '@protocol-labs-network/api';
import { useRouter } from 'next/router';
import { ProfileCard } from '../../shared/profile/profile-cards/profile-card';
import { ProfileCards } from '../../shared/profile/profile-cards/profile-cards';

interface MemberProfileTeamsProps {
  teams: ITeam[];
}

export function MemberProfileTeams({ teams }: MemberProfileTeamsProps) {
  const {
    query: { id },
  } = useRouter();

  return (
    <ProfileCards title="Teams" count={teams.length}>
      {teams.map((team) => (
        <ProfileCard
          key={`${id}.${team.id}`}
          url={`/teams/${team.id}`}
          imageUrl={team.logo}
          avatarIcon={UserGroupIcon}
          name={team.name}
          description={team.shortDescription || team.longDescription}
          tags={team.tags}
        />
      ))}
    </ProfileCards>
  );
}
