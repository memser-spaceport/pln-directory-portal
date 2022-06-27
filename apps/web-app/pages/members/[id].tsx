import airtableService from '@protocol-labs-network/airtable';
import { IMember, ITeam } from '@protocol-labs-network/api';
import { Breadcrumb } from '@protocol-labs-network/ui';
import Head from 'next/head';
import { MemberProfileHeader } from '../../components/members/member-profile/member-profile-header';
import { MemberProfileOfficeHours } from '../../components/members/member-profile/member-profile-office-hours';
import { MemberProfileTeams } from '../../components/members/member-profile/member-profile-teams';
import { useProfileBreadcrumb } from '../../hooks/profile/use-profile-breadcrumb.hook';

interface MemberProps {
  member: IMember;
  teams: ITeam[];
  backLink: string;
}

export default function Member({ member, teams, backLink }: MemberProps) {
  const { breadcrumbItems } = useProfileBreadcrumb({
    backLink,
    directoryName: 'Members',
    pageName: member.name,
  });

  return (
    <section className="mx-10 my-3">
      <Head>
        <title>Member {member.name}</title>
      </Head>
      <Breadcrumb items={breadcrumbItems} />
      <div className="mt-6 flex items-start space-x-10">
        <div className="flex grow flex-col space-y-8">
          <MemberProfileHeader member={member} />
          <MemberProfileTeams teams={teams} />
        </div>
        <MemberProfileOfficeHours url={member.officeHours} />
      </div>
    </section>
  );
}

export const getServerSideProps = async ({ query, res }) => {
  const { id, backLink = '/members' } = query as {
    id: string;
    backLink: string;
  };
  const member = await airtableService.getMember(id);
  const teams = await airtableService.getTeamCardsData(member.teams);

  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
  );

  return {
    props: { member, teams, backLink },
  };
};
