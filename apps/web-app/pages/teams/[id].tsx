import airtableService from '@protocol-labs-network/airtable';
import { ILabber, ITeam } from '@protocol-labs-network/api';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import TeamProfileDetails from '../../components/team-profile/team-profile-details/team-profile-details';
import TeamProfileSidebar from '../../components/team-profile/team-profile-sidebar/team-profile-sidebar';

interface TeamProps {
  team: ITeam;
  members: ILabber[];
  membersTeamsNames: { [teamId: string]: string };
}

export default function Team({ team, members, membersTeamsNames }: TeamProps) {
  return (
    <section className="p-8 mx-36">
      <Head>
        <title>Team {team.name}</title>
      </Head>

      <div className="flex items-stretch gap-x-6">
        <TeamProfileSidebar team={team} />
        <TeamProfileDetails
          team={team}
          members={members}
          membersTeamsNames={membersTeamsNames}
        />
      </div>
    </section>
  );
}

export const getServerSideProps: GetServerSideProps<TeamProps> = async (
  context
) => {
  const { id } = context.query as { id: string };
  const team = await airtableService.getTeam(id);
  const members = await airtableService.getTeamMembers(team.name);
  const membersTeamsNames = await airtableService.getMembersTeamsNames(members);

  return {
    props: { team, members, membersTeamsNames },
  };
};
