import airtableService from '@protocol-labs-network/airtable';
import { IMember, ITeam } from '@protocol-labs-network/api';
import {
  getMember,
  getMemberUIDByAirtableId,
  parseMember,
} from '@protocol-labs-network/members/data-access';
import { getTeams, parseTeam } from '@protocol-labs-network/teams/data-access';
import { Breadcrumb } from '@protocol-labs-network/ui';
import { NextSeo } from 'next-seo';
import { ReactElement } from 'react';
import { MemberProfileDetails } from '../../../components/members/member-profile/member-profile-details/member-profile-details';
import { MemberProfileHeader } from '../../../components/members/member-profile/member-profile-header/member-profile-header';
import { MemberProfileOfficeHours } from '../../../components/members/member-profile/member-profile-office-hours/member-profile-office-hours';
import { MemberProfileTeams } from '../../../components/members/member-profile/member-profile-teams';
import { AskToEditCard } from '../../../components/shared/profile/ask-to-edit-card/ask-to-edit-card';
import { TEAM_CARD_FIELDS } from '../../../components/teams/teams-directory/team-card/team-card.constants';
import { AIRTABLE_REGEX } from '../../../constants';
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
  let member: IMember;
  let teams: ITeam[];

  // Fetches member data from the custom API when the USE_CUSTOM_PLNETWORK_API environment variable is set
  // TODO: Refactor when cleaning up Airtable-related code
  if (process.env.USE_CUSTOM_PLNETWORK_API) {
    // Check if provided ID is an Airtable ID, and if so, get the corresponding backend UID
    if (AIRTABLE_REGEX.test(id)) {
      const memberUID = await getMemberUIDByAirtableId(id);

      return memberUID
        ? {
            redirect: {
              permanent: true,
              destination: `/directory/members/${memberUID}`,
            },
          }
        : {
            notFound: true,
          };
    }

    const [memberResponse, memberTeamsResponse] = await Promise.all([
      getMember(id, {
        with: 'image,skills,location,teamMemberRoles.team',
      }),
      getTeams({
        'teamMemberRoles.member.uid': id,
        select:
          'uid,name,logo.url,industryTags.title,teamMemberRoles.role,teamMemberRoles.mainTeam',
        pagination: false,
      }),
    ]);

    if (memberResponse.status === 200 && memberTeamsResponse.status === 200) {
      member = parseMember(memberResponse.body);
      teams = memberTeamsResponse.body.map(parseTeam);
    }
  } else {
    member = await airtableService.getMember(id);
  }

  // Redirects user to the 404 page if response from
  // getMember is undefined or the member has no teams
  if (!member || !member.teams.length) {
    return {
      notFound: true,
    };
  }

  // Fetches member teams information if datasource is Airtable
  // TODO: Remove when cleaning up Airtable-related code
  if (!process.env.USE_CUSTOM_PLNETWORK_API) {
    teams = await airtableService.getTeamCardsData(
      member.teams,
      TEAM_CARD_FIELDS
    );
  }

  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  // Disable cache when using Airtable as datasource.
  res.setHeader(
    'Cache-Control',
    process.env.USE_CUSTOM_PLNETWORK_API
      ? 'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
      : 'no-cache, no-store, max-age=0, must-revalidate'
  );

  return {
    props: { member, teams, backLink },
  };
};
