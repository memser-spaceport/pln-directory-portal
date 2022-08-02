import { ITeam } from '@protocol-labs-network/api';
import { DirectoryEmpty } from '../../../../components/directory/directory-empty/directory-empty';
import { TeamCard } from '../../../../components/shared/teams/team-card/team-card';

interface TeamsDirectoryListProps {
  teams: ITeam[];
  isGrid: boolean;
}

export function TeamsDirectoryList({ teams, isGrid }: TeamsDirectoryListProps) {
  return (
    <>
      <div className="teams-list flex flex-wrap gap-4">
        {teams.map((team) => {
          return <TeamCard key={team.id} team={team} isGrid={isGrid} />;
        })}
      </div>

      {!teams.length ? (
        <div className="flex justify-center">
          <DirectoryEmpty
            filterProperties={[
              'tags',
              'acceleratorPrograms',
              'fundingStage',
              'technology',
              'searchBy',
            ]}
          />
        </div>
      ) : null}
    </>
  );
}
