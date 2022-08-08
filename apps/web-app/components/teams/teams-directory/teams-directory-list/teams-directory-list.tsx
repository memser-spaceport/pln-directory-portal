import { ITeam } from '@protocol-labs-network/api';
import { DirectoryList } from '../../../../components/directory/directory-list/directory-list';
import { TeamCard } from '../../../../components/shared/teams/team-card/team-card';

interface TeamsDirectoryListProps {
  teams: ITeam[];
  isGrid: boolean;
}

export function TeamsDirectoryList({ teams, isGrid }: TeamsDirectoryListProps) {
  return (
    <DirectoryList
      filterProperties={[
        'tags',
        'acceleratorPrograms',
        'fundingStage',
        'technology',
        'searchBy',
      ]}
      itemsCount={teams.length}
    >
      {teams.map((team) => {
        return <TeamCard key={team.id} team={team} isGrid={isGrid} />;
      })}
    </DirectoryList>
  );
}
