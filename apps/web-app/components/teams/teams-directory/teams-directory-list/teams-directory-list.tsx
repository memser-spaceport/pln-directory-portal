import { ITeam } from '@protocol-labs-network/api';
import { DirectoryList } from '../../../../components/directory/directory-list/directory-list';
import { TeamCard } from '../../../../components/shared/teams/team-card/team-card';

interface TeamsDirectoryListProps {
  teams: ITeam[];
  isGrid: boolean;
  filterProperties: string[];
}

export function TeamsDirectoryList({
  teams,
  isGrid,
  filterProperties,
}: TeamsDirectoryListProps) {
  return (
    <DirectoryList
      filterProperties={filterProperties}
      itemsCount={teams.length}
    >
      {teams.map((team) => {
        return <TeamCard key={team.id} team={team} isGrid={isGrid} />;
      })}
    </DirectoryList>
  );
}
