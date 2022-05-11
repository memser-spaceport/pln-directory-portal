import airtableService from '@protocol-labs-network/airtable';
import { ITeam } from '@protocol-labs-network/api';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { TeamCard } from '../../components/TeamCard/TeamCard';

type TeamsProps = {
  teams: ITeam[];
};

export default function Teams({ teams }: TeamsProps) {
  return (
    <section className="p-8 min-w-[768px] max-w-[1164px] mx-auto">
      <Head>
        <title>Teams</title>
      </Head>
      <h1 className="text-3xl font-bold text-slate-900 mb-10">Teams</h1>

      <div className="flex flex-wrap gap-5">
        {teams.map((team) => {
          return <TeamCard key={team.id} team={team} />;
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
