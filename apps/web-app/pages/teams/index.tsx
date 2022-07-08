import airtableService from '@protocol-labs-network/airtable';
import { ITeam } from '@protocol-labs-network/api';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { DirectorySearch } from '../../components/directory/directory-search/directory-search';
import { DirectorySort } from '../../components/directory/directory-sort/directory-sort';
import { DirectoryView } from '../../components/directory/directory-view/directory-view';
import { useViewType } from '../../components/directory/directory-view/use-directory-view-type.hook';
import { TeamCard } from '../../components/shared/teams/team-card/team-card';
import { TeamsDirectoryFilters } from '../../components/teams/teams-directory/teams-directory-filters/teams-directory-filters';
import { ITeamsFiltersValues } from '../../components/teams/teams-directory/teams-directory-filters/teams-directory-filters.types';
import { parseTeamsFilters } from '../../components/teams/teams-directory/teams-directory-filters/teams-directory-filters.utils';
import { getTeamsDirectoryRequestOptionsFromQuery } from '../../utils/api/list.utils';

type TeamsProps = {
  teams: ITeam[];
  filtersValues: ITeamsFiltersValues;
};

export default function Teams({ teams, filtersValues }: TeamsProps) {
  const { selectedViewType } = useViewType();
  const isGrid = selectedViewType === 'grid';

  return (
    <>
      <Head>
        <title>Teams</title>
      </Head>

      <section className="flex">
        <div className="w-[291px] flex-shrink-0 border-r border-r-slate-200 bg-white">
          <TeamsDirectoryFilters filtersValues={filtersValues} />
        </div>

        <div className="mx-auto p-8">
          <div className="w-[917px] flex-shrink-0">
            <div className="mb-10 flex items-center justify-between">
              <h1 className="text-3xl font-bold">Teams</h1>
              <div className="flex items-center space-x-4">
                <DirectorySearch placeholder="Search for a team" />
                <span className="h-6 w-px bg-slate-300" />
                <DirectorySort />
                <DirectoryView />
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              {teams.map((team) => {
                return (
                  <TeamCard
                    key={team.id}
                    isClickable
                    team={team}
                    isGrid={isGrid}
                  />
                );
              })}
            </div>

            <div className="mt-8 text-sm text-slate-500">
              Showing <b>{teams.length}</b> results
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<TeamsProps> = async ({
  query,
  res,
}) => {
  const options = getTeamsDirectoryRequestOptionsFromQuery(query);
  const [teams, filtersValues] = await Promise.all([
    airtableService.getTeams(options),
    airtableService.getTeamsFiltersValues(options),
  ]);
  const parsedFilters = parseTeamsFilters(filtersValues, query);

  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
  );

  return {
    props: { teams, filtersValues: parsedFilters },
  };
};
