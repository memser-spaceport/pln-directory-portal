import airtableService from '@protocol-labs-network/airtable';
import { ITeam } from '@protocol-labs-network/api';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { DirectoryHeader } from '../../components/directory/directory-header/directory-header';
import { useViewType } from '../../components/directory/directory-view/use-directory-view-type.hook';
import { TeamsDirectoryFilters } from '../../components/teams/teams-directory/teams-directory-filters/teams-directory-filters';
import { ITeamsFiltersValues } from '../../components/teams/teams-directory/teams-directory-filters/teams-directory-filters.types';
import { parseTeamsFilters } from '../../components/teams/teams-directory/teams-directory-filters/teams-directory-filters.utils';
import { TeamsDirectoryList } from '../../components/teams/teams-directory/teams-directory-list/teams-directory-list';
import {
  getTeamsDirectoryListOptions,
  getTeamsDirectoryRequestOptionsFromQuery,
} from '../../utils/api/list.utils';

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

      <section className="flex pl-[291px]">
        <div className="fixed left-0 h-full w-[291px] flex-shrink-0 border-r border-r-slate-200 bg-white">
          <TeamsDirectoryFilters filtersValues={filtersValues} />
        </div>

        <div className="mx-auto p-8">
          <div className="w-[917px] space-y-10">
            <DirectoryHeader
              title="Teams"
              searchPlaceholder="Search for a team"
              count={teams.length}
            />

            <TeamsDirectoryList teams={teams} isGrid={isGrid} />
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
  const optionsFromQuery = getTeamsDirectoryRequestOptionsFromQuery(query);
  const listOptions = getTeamsDirectoryListOptions(optionsFromQuery);
  const [teams, filtersValues] = await Promise.all([
    airtableService.getTeams(listOptions),
    airtableService.getTeamsFiltersValues(optionsFromQuery),
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
