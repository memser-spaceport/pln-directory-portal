import { ITeam } from '@protocol-labs-network/api';
import { DirectoryEmpty } from '../../../../components/directory/directory-empty/directory-empty';
import { DirectoryError } from '../../../../components/directory/directory-error/directory-error';
import { DirectoryLoading } from '../../../../components/directory/directory-loading/directory-loading';
import { TeamCard } from '../../../../components/shared/teams/team-card/team-card';
import { useInfiniteScroll } from '../../../../hooks/directory/use-infinite-scroll.hook';

interface TeamsDirectoryListProps {
  teamsData: ITeam[];
  isGrid: boolean;
}

export function TeamsDirectoryList({
  teamsData,
  isGrid,
}: TeamsDirectoryListProps) {
  const cardSelector = '.teams-list > .card:last-child';
  const baseAPIRoute = '/api/teams';
  const dataResultsProp = 'teams';
  const [teams, loading, error] = useInfiniteScroll({
    initialItems: teamsData,
    baseAPIRoute,
    cardSelector,
    dataResultsProp,
  });

  return (
    <>
      <div className="teams-list flex flex-wrap gap-4">
        {(teams as ITeam[]).map((team) => {
          return <TeamCard key={team.id} team={team} isGrid={isGrid} />;
        })}
      </div>

      {!loading && !error && !teams.length && (
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
      )}

      {loading && (
        <div className="flex justify-center">
          <DirectoryLoading />
        </div>
      )}

      {error && (
        <div className="flex justify-center">
          <DirectoryError />
        </div>
      )}
    </>
  );
}
