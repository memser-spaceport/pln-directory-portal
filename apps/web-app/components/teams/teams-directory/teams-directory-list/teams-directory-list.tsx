import { ITeam } from '@protocol-labs-network/api';
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
  const [teams, loading] = useInfiniteScroll({
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

      {loading && (
        <div className="flex justify-center">
          <DirectoryLoading />
        </div>
      )}
    </>
  );
}
