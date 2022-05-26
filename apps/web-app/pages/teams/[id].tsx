import airtableService from '@protocol-labs-network/airtable';
import { ITeam } from '@protocol-labs-network/api';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import TeamProfileDetails from '../../components/team-profile/team-profile-details/team-profile-details';
import TeamProfileSidebar from '../../components/team-profile/team-profile-sidebar/team-profile-sidebar';

interface TeamProps {
  team: ITeam;
}

export default function Team({ team }: TeamProps) {
  return (
    <section className="p-8 min-w-[768px] max-w-[1164px] mx-auto">
      <Head>
        <title>Team {team.name}</title>
      </Head>

      <div className="flex items-stretch">
        <TeamProfileSidebar team={team} />
        <TeamProfileDetails team={team} />
      </div>
    </section>
  );
}

export const getServerSideProps: GetServerSideProps<TeamProps> = async (
  context
) => {
  const { id } = context.query as { id: string };
  const team = await airtableService.getTeam(id);

  return {
    props: { team },
  };
};
