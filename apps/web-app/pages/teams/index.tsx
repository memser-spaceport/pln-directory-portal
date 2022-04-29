import { ToggleView, ToggleViewProps } from '@protocol-labs-network/ui';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState } from 'react';
import { TeamCard, TeamCardProps } from '../../components/TeamCard/TeamCard';
import { MOCK_TEAMS_LIST as TEAMS_LIST } from '../../utils';

type TeamsProps = {
  teams: TeamCardProps[];
};

export default function Teams({ teams }: TeamsProps) {
  const [isGrid, setIsGrid] = useState(true);

  function toggleViewMode(e: Parameters<ToggleViewProps['onClick']>[0]) {
    if (e.currentTarget.id === 'list-btn') {
      setIsGrid(false);
    }
    if (e.currentTarget.id === 'grid-btn') {
      setIsGrid(true);
    }
  }

  return (
    <section className="p-8 min-w-[768px] max-w-[1164px] mx-auto">
      <Head>
        <title>Teams</title>
      </Head>

      <div className="flex items-end mb-10">
        <h1 className="text-3xl font-bold text-slate-900">Teams</h1>
        <div className="ml-auto">
          <ToggleView isGrid={isGrid} onClick={(e) => toggleViewMode(e)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        {teams.map((team) => {
          const { id, ...fields } = team;

          return <TeamCard key={id} isGrid={isGrid} {...{ id, ...fields }} />;
        })}
      </div>

      <div className="mt-8 text-sm text-slate-500">
        Showing <b>{teams.length}</b> results
      </div>
    </section>
  );
}

export const getServerSideProps: GetServerSideProps<TeamsProps> = async () => {
  return {
    props: { teams: TEAMS_LIST }, // will be passed to the page component as props
  };
};
