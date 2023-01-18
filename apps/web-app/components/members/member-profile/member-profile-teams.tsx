import { UserGroupIcon } from '@heroicons/react/solid';
import { IMember, ITeam } from '@protocol-labs-network/api';
import { useRouter } from 'next/router';
import { ProfileCard } from '../../shared/profile/profile-cards/profile-card';
import { ProfileCards } from '../../shared/profile/profile-cards/profile-cards';

interface MemberProfileTeamsProps {
  teams: ITeam[];
  member: IMember;
}

export function MemberProfileTeams({ teams, member }: MemberProfileTeamsProps) {
  const {
    query: { id },
  } = useRouter();

  return (
    <ProfileCards title="Teams" count={teams.length}>
      {teams.map((team, i) => (
        <ProfileCard
          key={`${id}.${team.id}`}
          url={`/directory/teams/${team.id}`}
          imageUrl={team.logo}
          avatarIcon={UserGroupIcon}
          name={team.name}
          description={
            member.teams.find((memberTeam) => memberTeam.id === team.id)
              ?.role || 'Contributor'
          }
          tags={team.tags}
          showMainTeamBadge={teams.length > 1 && i === 0}
        />
      ))}
    </ProfileCards>
  );
}
