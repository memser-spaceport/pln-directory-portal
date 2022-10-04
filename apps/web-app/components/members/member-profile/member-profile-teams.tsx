import { UserGroupIcon } from '@heroicons/react/solid';
import { ITeam } from '@protocol-labs-network/api';
import { useRouter } from 'next/router';
import { ProfileCard } from '../../shared/profile/profile-cards/profile-card';
import { ProfileCards } from '../../shared/profile/profile-cards/profile-cards';

interface MemberProfileTeamsProps {
  teams: ITeam[];
  roles?: string[];
}

export function MemberProfileTeams({ teams, roles }: MemberProfileTeamsProps) {
  const {
    query: { id },
  } = useRouter();

  return (
    <ProfileCards title="Teams" count={teams.length}>
      {teams.map((team, i) => (
        <ProfileCard
          key={`${id}.${team.id}`}
          url={`/teams/${team.id}`}
          imageUrl={team.logo}
          avatarIcon={UserGroupIcon}
          name={team.name}
          description={roles[i] || 'Contributor'}
          tags={team.tags}
          showMainTeamBadge={teams.length > 1 && i === 0}
        />
      ))}
    </ProfileCards>
  );
}
