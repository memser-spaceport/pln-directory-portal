import { ITeam } from '@protocol-labs-network/api';
import { useRouter } from 'next/router';
import { stringify } from 'querystring';
import { useCallback, useEffect, useState } from 'react';
import { DirectoryLoading } from '../../../../components/directory/directory-loading/directory-loading';
import { TeamCard } from '../../../../components/shared/teams/team-card/team-card';
import { ITEMS_PER_PAGE } from '../../../../constants';

interface TeamsDirectoryListProps {
  teamsData: ITeam[];
  isGrid: boolean;
}

export function TeamsDirectoryList({
  teamsData,
  isGrid,
}: TeamsDirectoryListProps) {
  const [teams, setTeams] = useState<ITeam[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [offset, setOffset] = useState<string>();
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Set first page of teams based on teamsData
  useEffect(() => {
    if (teamsData) {
      setTeams(teamsData);
    }
  }, [teamsData]);

  useEffect(() => {
    // Make sure that we load additional items if the first 9 items don't
    // take more than the viewport height
    handleScroll();

    // Listen to the scroll position for loading additional data
    window.addEventListener('scroll', handleScroll);

    // Listen to route changes to reset state on non-shallow navigations
    router.events.on('routeChangeComplete', handleRouteChange);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  });

  // When navigation isn't shallow, reset component state to ensure that we
  // request data from the first page onwards
  const handleRouteChange = useCallback(
    (_pathname: string, { shallow }: { shallow: boolean }) => {
      if (!shallow) {
        setInitialLoad(true);
        setOffset('');
      }
    },
    [setInitialLoad, setOffset]
  );

  const handleScroll = useCallback(async () => {
    // Get last visible team
    const lastTeamLoaded: HTMLDivElement = document.querySelector(
      '.teams-list > .card:last-child'
    );

    if (lastTeamLoaded) {
      // Get offset from the middle of the last visible team
      const lastTeamLoadedOffset =
        lastTeamLoaded.offsetTop + lastTeamLoaded.clientHeight / 2;
      const pageOffset = window.pageYOffset + window.innerHeight;

      // Detects when user scrolls down till the middle of the last card
      if (pageOffset > lastTeamLoadedOffset) {
        // Prevent new requests:
        // - When there is no offset defined (unless it's the initial load)
        // - When there is only one page of results
        // - While already loading data;
        if (
          (initialLoad || offset) &&
          teams.length >= ITEMS_PER_PAGE &&
          !loading
        ) {
          setLoading(true);

          // After the initial load, set the tracking state to false
          if (initialLoad) {
            setInitialLoad(false);
          }

          // Make a request to the teams API Route
          // with the currently selected query params and the available offset
          let url = '/api/teams';
          const queryString = stringify(router.query);

          if (offset) {
            url += `?offset=${offset}`;

            if (queryString) {
              url += `&${queryString}`;
            }
          } else if (queryString) {
            url += `?${queryString}`;
          }

          const response = await fetch(url);
          const data = await response.json();

          // Update internal state with the response data
          setTeams([...teams, ...data.teams]);
          setOffset(data.offset);
          setLoading(false);
        }
      }
    }
  }, [initialLoad, loading, offset, teams, router]);

  return (
    <>
      <div className="teams-list flex flex-wrap gap-4">
        {teams.map((team) => {
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
