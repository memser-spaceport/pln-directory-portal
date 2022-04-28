import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { TeamCard, TeamCardProps } from '../../components/TeamCard/TeamCard';
import { MOCK_TEAMS_LIST as TEAMS_LIST } from '../../utils';

type TeamsProps = {
  teams: TeamCardProps[];
};

export default function Teams({ teams }: TeamsProps) {
  return (
    <section className="px-28 py-8 min-w-[768px] max-w-[1324px] mx-auto">
      <Head>
        <title>Teams</title>
      </Head>
      <h1 className="text-3xl font-bold text-slate-900 mb-10">Teams</h1>

      <div className="flex flex-wrap gap-5">
        {teams.map((team) => {
          const { id, ...fields } = team;

          return <TeamCard key={id} {...{ id, ...fields }} />;
        })}
      </div>

      <div className="mt-8 text-sm text-slate-500">
        Showing <b>{teams.length}</b> results
      </div>
    </section>
  );
}

export const getServerSideProps: GetServerSideProps<TeamsProps> = async (
  context
) => {
  return {
    props: { teams: TEAMS_LIST }, // will be passed to the page component as props
  };
};
