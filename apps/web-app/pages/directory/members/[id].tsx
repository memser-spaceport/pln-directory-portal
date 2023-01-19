import airtableService from '@protocol-labs-network/airtable';
import { IMember, ITeam } from '@protocol-labs-network/api';
import { Breadcrumb } from '@protocol-labs-network/ui';
import { NextSeo } from 'next-seo';
import { ReactElement } from 'react';
import { MemberProfileDetails } from '../../../components/members/member-profile/member-profile-details/member-profile-details';
import { MemberProfileHeader } from '../../../components/members/member-profile/member-profile-header/member-profile-header';
import { MemberProfileOfficeHours } from '../../../components/members/member-profile/member-profile-office-hours/member-profile-office-hours';
import { MemberProfileTeams } from '../../../components/members/member-profile/member-profile-teams';
import { AskToEditCard } from '../../../components/shared/ask-to-edit-card/ask-to-edit-card';
import { TEAM_CARD_FIELDS } from '../../../components/shared/teams/team-card/team-card.constants';
import { useProfileBreadcrumb } from '../../../hooks/profile/use-profile-breadcrumb.hook';
import { DirectoryLayout } from '../../../layouts/directory-layout';
import { DIRECTORY_SEO } from '../../../seo.config';

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
  const description = member.mainTeam
    ? `${member.mainTeam.role} at ${member.mainTeam.name}`
    : 'Contributor';

  return (
    <>
      <NextSeo
        {...DIRECTORY_SEO}
        title={member.name}
        description={description}
      />

      <Breadcrumb items={breadcrumbItems} />

      <section className="space-x-7.5 mx-auto mb-10 flex max-w-7xl px-10 pt-24">
        <div className="card p-7.5 w-full">
          <MemberProfileHeader {...member} />
          <MemberProfileDetails {...member} />
          <MemberProfileOfficeHours url={member.officeHours} />
          <MemberProfileTeams teams={teams} member={member} />
        </div>
        <div className="w-sidebar shrink-0">
          <AskToEditCard profileType="member" />
        </div>
      </section>
    </>
  );
}

Member.getLayout = function getLayout(page: ReactElement) {
  return <DirectoryLayout>{page}</DirectoryLayout>;
};

export const getServerSideProps = async ({ query, res }) => {
  const { id, backLink = '/directory/members' } = query as {
    id: string;
    backLink: string;
  };
  const member = await airtableService.getMember(id);

  // Redirects user to the 404 page if response from
  // getMember is undefined or the member has no teams
  if (!member || !member.teams.length) {
    return {
      notFound: true,
    };
  }

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
