import airtableService from '@protocol-labs-network/airtable';
import { IMember, ITeam } from '@protocol-labs-network/api';
import { Breadcrumb } from '@protocol-labs-network/ui';
import Head from 'next/head';
import { MemberProfileHeader } from '../../components/members/member-profile/member-profile-header';
import { MemberProfileOfficeHours } from '../../components/members/member-profile/member-profile-office-hours';
import { MemberProfileTeams } from '../../components/members/member-profile/member-profile-teams';
import { AskToEditCard } from '../../components/shared/ask-to-edit-card/ask-to-edit-card';
import { TEAM_CARD_FIELDS } from '../../components/shared/teams/team-card/team-card.constants';
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
    <>
      <Head>
        <title>Member {member.name}</title>
      </Head>
      <Breadcrumb items={breadcrumbItems} />
      <section className="px-10 py-3">
        <div className="mt-6 flex items-start space-x-10">
          <div className="flex grow flex-col space-y-8">
            <MemberProfileHeader member={member} />
            <MemberProfileTeams teams={teams} />
          </div>
          <div className="w-[291px] shrink-0 flex-col space-y-4">
            <AskToEditCard profileType="member" profileName={member.name} />
            <MemberProfileOfficeHours url={member.officeHours} />
          </div>
        </div>
      </section>
    </>
  );
}

export const getServerSideProps = async ({ query, res }) => {
  const { id, backLink = '/members' } = query as {
    id: string;
    backLink: string;
  };
  const member = await airtableService.getMember(id);
  const teams = await airtableService.getTeamCardsData(
    member.teams,
    TEAM_CARD_FIELDS
  );

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
