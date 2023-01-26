import airtableService from '@protocol-labs-network/airtable';
import { IMember, ITeam } from '@protocol-labs-network/api';
import {
  getMembers,
  parseTeamMember,
} from '@protocol-labs-network/members/data-access';
import { getTeam, parseTeam } from '@protocol-labs-network/teams/data-access';
import { Breadcrumb } from '@protocol-labs-network/ui';
import orderBy from 'lodash/orderBy';
import { GetServerSideProps } from 'next';
import { NextSeo } from 'next-seo';
import { ReactElement } from 'react';
import { AskToEditCard } from '../../../components/shared/ask-to-edit-card/ask-to-edit-card';
import { MEMBER_CARD_FIELDS } from '../../../components/shared/members/member-card/member-card.constants';
import { TeamProfileDetails } from '../../../components/teams/team-profile/team-profile-details/team-profile-details';
import { TeamProfileFunding } from '../../../components/teams/team-profile/team-profile-funding/team-profile-funding';
import { TeamProfileHeader } from '../../../components/teams/team-profile/team-profile-header/team-profile-header';
import { TeamProfileMembers } from '../../../components/teams/team-profile/team-profile-members/team-profile-members';
import { useProfileBreadcrumb } from '../../../hooks/profile/use-profile-breadcrumb.hook';
import { DirectoryLayout } from '../../../layouts/directory-layout';
import { DIRECTORY_SEO } from '../../../seo.config';

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
      <NextSeo
        {...DIRECTORY_SEO}
        title={team.name}
        description={team.shortDescription}
      />

      <Breadcrumb items={breadcrumbItems} />
      <section className="space-x-7.5 mx-auto mb-10 flex max-w-7xl px-10 pt-24">
        <div className="card p-7.5 w-full">
          <TeamProfileHeader {...team} />
          <TeamProfileDetails {...team} />
          {team.fundingStage || team.membershipSources.length ? (
            <TeamProfileFunding {...team} />
          ) : null}
          <TeamProfileMembers members={members} />
        </div>
        <div className="w-sidebar shrink-0">
          <AskToEditCard profileType="team" />
        </div>
      </section>
    </>
  );
}

Team.getLayout = function getLayout(page: ReactElement) {
  return <DirectoryLayout>{page}</DirectoryLayout>;
};

export const getServerSideProps: GetServerSideProps<TeamProps> = async ({
  query,
  res,
}) => {
  const { id, backLink = '/directory/teams' } = query as {
    id: string;
    backLink: string;
  };
  let team: ITeam;
  let members: IMember[];

  // Fetches team data from the custom API when the USE_CUSTOM_PLNETWORK_API environment variable is set
  // TODO: Refactor when cleaning up Airtable-related code
  if (process.env.USE_CUSTOM_PLNETWORK_API) {
    const [teamResponse, teamMembersResponse] = await Promise.all([
      getTeam(id, {
        with: 'logo,technologies,membershipSources,industryTags,fundingStage,teamMemberRoles.member',
      }),
      getMembers({
        'teamMemberRoles.team.uid': id,
        select:
          'uid,name,image.url,skills.title,teamMemberRoles.team.uid,teamMemberRoles.team.name,teamMemberRoles.role,teamMemberRoles.teamLead,teamMemberRoles.mainTeam',
        pagination: false,
      }),
    ]);

    if (teamResponse.status === 200 && teamMembersResponse.status === 200) {
      team = parseTeam(teamResponse.body);
      members = orderBy(
        teamMembersResponse.body.map((member) =>
          parseTeamMember(member, team.id)
        ),
        ['teamLead', 'name'],
        ['desc', 'asc']
      );
    }
  } else {
    team = await airtableService.getTeam(id);
  }

  // Redirects user to the 404 page when we're unable to fetch
  // a valid team with the provided ID
  if (!team) {
    return {
      notFound: true,
    };
  }

  // Fetches team members information if datasource is Airtable
  // TODO: Remove when cleaning up Airtable-related code
  if (!process.env.USE_CUSTOM_PLNETWORK_API) {
    members = await airtableService.getTeamMembers(
      team.name,
      MEMBER_CARD_FIELDS
    );
  }

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
