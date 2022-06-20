import airtableService from '@protocol-labs-network/airtable';
import { IMemberWithTeams, ITeam } from '@protocol-labs-network/api';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import TeamProfileDetails from '../../components/teams/team-profile/team-profile-details/team-profile-details';
import TeamProfileSidebar from '../../components/teams/team-profile/team-profile-sidebar/team-profile-sidebar';

interface TeamProps {
  team: ITeam;
  members: IMemberWithTeams[];
}

export default function Team({ team, members }: TeamProps) {
  return (
    <section>
      <Head>
        <title>Team {team.name}</title>
      </Head>

      <div className="flex pt-10">
        <TeamProfileSidebar team={team} />
        <TeamProfileDetails team={team} members={members} />
      </div>
    </section>
  );
}

export const getServerSideProps: GetServerSideProps<TeamProps> = async ({
  query,
  res,
}) => {
  const { id } = query as { id: string };
  const team = await airtableService.getTeam(id);
  const members = await airtableService.getTeamMembers(team.name);

  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
  );

  return {
    props: { team, members },
  };
};
