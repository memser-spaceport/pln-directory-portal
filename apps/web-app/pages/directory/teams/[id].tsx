import airtableService from '@protocol-labs-network/airtable';
import { IMember, ITeam } from '@protocol-labs-network/api';
import { Breadcrumb } from '@protocol-labs-network/ui';
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
          {team.fundingStage || team.acceleratorPrograms.length ? (
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
  const team = await airtableService.getTeam(id);

  // Redirects user to the 404 page when we're unable to fetch
  // a valid team with the provided ID
  if (!team) {
    return {
      notFound: true,
    };
  }

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
