import airtableService from '@protocol-labs-network/airtable';
import { ITeam } from '@protocol-labs-network/api';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { DirectorySearch } from '../../components/directory-search/directory-search';
import { DirectorySort } from '../../components/directory/directory-sort/directory-sort';
import { SelectViewType } from '../../components/select-view-type/select-view-type';
import { useViewType } from '../../components/select-view-type/use-view-type.hook';
import { TeamCard } from '../../components/team-card/team-card';
import TeamsDirectoryFilters from '../../components/teams-directory/teams-directory-filters/teams-directory-filters';
import { ITeamsFiltersValues } from '../../components/teams-directory/teams-directory-filters/teams-directory-filters.types';
import { parseTeamsFilters } from '../../components/teams-directory/teams-directory-filters/teams-directory-filters.utils';
import { getListRequestOptionsFromQuery } from '../../utils/api/list.utils';

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
        <div className="w-[291px] flex-shrink-0 bg-white border-r border-r-slate-200">
          <TeamsDirectoryFilters filtersValues={filtersValues} />
        </div>

        <div className="p-8 w-[1164px] flex-shrink-0 mx-auto">
          <div className="flex justify-between items-center mb-10">
            <h1 className="text-3xl font-bold">Teams</h1>
            <div className="flex space-x-4 items-center">
              <DirectorySearch />
              <span className="w-px h-6 bg-slate-300" />
              <DirectorySort />
              <SelectViewType />
            </div>
          </div>

          <div className="flex flex-wrap gap-5">
            {teams.map((team) => {
              return <TeamCard key={team.id} team={team} isGrid={isGrid} />;
            })}
          </div>

          <div className="mt-8 text-sm text-slate-500">
            Showing <b>{teams.length}</b> results
          </div>
        </div>
      </section>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<TeamsProps> = async (
  context
) => {
  const options = getListRequestOptionsFromQuery(context.query);
  const [teams, filtersValues] = await Promise.all([
    airtableService.getTeams(options),
    airtableService.getTeamsFiltersValues(options),
  ]);
  const parsedFilters = parseTeamsFilters(filtersValues, context.query);

  return {
    props: { teams, filtersValues: parsedFilters },
  };
};
