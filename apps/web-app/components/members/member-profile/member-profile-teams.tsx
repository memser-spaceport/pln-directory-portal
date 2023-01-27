import { UserGroupIcon } from '@heroicons/react/solid';
import { IMember, ITeam } from '@protocol-labs-network/api';
import orderBy from 'lodash/orderBy';
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

  const sortedTeams = orderBy(
    member.teams,
    ['mainTeam', 'name'],
    ['desc', 'asc']
  );

  return (
    <ProfileCards title="Teams" count={teams.length}>
      {sortedTeams.map((team, i) => {
        const teamDetails = teams.find(
          (memberTeam) => memberTeam.id === team.id
        );

        return (
          <ProfileCard
            key={`${id}.${team.id}`}
            url={`/directory/teams/${team.id}`}
            imageUrl={teamDetails?.logo}
            avatarIcon={UserGroupIcon}
            name={team.name}
            description={team.role || 'Contributor'}
            tags={teamDetails?.industryTags.map((tag) => tag.title)}
            showMainTeamBadge={team.mainTeam && sortedTeams.length > 1}
          />
        );
      })}
    </ProfileCards>
  );
}
