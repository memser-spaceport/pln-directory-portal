import airtableService from '@protocol-labs-network/airtable';
import { ITeam } from '@protocol-labs-network/api';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { DirectorySort } from '../../components/directory-sort/directory-sort';
import { SelectViewType } from '../../components/select-view-type/select-view-type';
import { useViewType } from '../../components/select-view-type/use-view-type.hook';
import { TeamCard } from '../../components/TeamCard/TeamCard';

type TeamsProps = {
  teams: ITeam[];
};

export default function Teams({ teams }: TeamsProps) {
  const { selectedViewType } = useViewType();
  const isGrid = selectedViewType === 'grid';

  return (
    <section className="p-8 min-w-[768px] max-w-[1164px] mx-auto">
      <Head>
        <title>Teams</title>
      </Head>

      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold">Teams</h1>
        <div className="flex space-x-4">
          <DirectorySort></DirectorySort>
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
    </section>
  );
}

export const getServerSideProps: GetServerSideProps<TeamsProps> = async () => {
  const teams = await airtableService.getTeams();

  return {
    props: { teams },
  };
};
