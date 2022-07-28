import airtableService from '@protocol-labs-network/airtable';
import { IMember, ITeam } from '@protocol-labs-network/api';
import { Breadcrumb } from '@protocol-labs-network/ui';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { AskToEditCard } from '../../components/shared/ask-to-edit-card/ask-to-edit-card';
import { MEMBER_CARD_FIELDS } from '../../components/shared/members/member-card/member-card.constants';
import TeamProfileDetails from '../../components/teams/team-profile/team-profile-details/team-profile-details';
import TeamProfileSidebar from '../../components/teams/team-profile/team-profile-sidebar/team-profile-sidebar';
import { useProfileBreadcrumb } from '../../hooks/profile/use-profile-breadcrumb.hook';

interface TeamProps {
  team: ITeam;
  members: IMember[];
  backLink: string;
}

export default function Team({ team, members, backLink }: TeamProps) {
  const { breadcrumbItems } = useProfileBreadcrumb({
    backLink,
    directoryName: 'Teams',
    pageName: team.name,
  });

  return (
    <>
      <Head>
        <title>Team {team.name}</title>
      </Head>
      <Breadcrumb items={breadcrumbItems} />
      <section className="px-10 pt-24">
        <div className="mb-10 flex space-x-10">
          <TeamProfileSidebar team={team} />
          <TeamProfileDetails team={team} members={members} />
          <div className="w-[291px] shrink-0">
            <AskToEditCard profileType="team" profileName={team.name} />
          </div>
        </div>
      </section>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<TeamProps> = async ({
  query,
  res,
}) => {
  const { id, backLink = '/teams' } = query as {
    id: string;
    backLink: string;
  };
  const team = await airtableService.getTeam(id);
  const members = await airtableService.getTeamMembers(
    team.name,
    MEMBER_CARD_FIELDS
  );

  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
  );

  return {
    props: { team, members, backLink },
  };
};
