import airtableService from '@protocol-labs-network/airtable';
import { IMemberWithTeams, ITeam } from '@protocol-labs-network/api';
import { Breadcrumb, IBreadcrumbItem } from '@protocol-labs-network/ui';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { AskToEditLink } from '../../components/shared/ask-to-edit-link/ask-to-edit-link';
import TeamProfileDetails from '../../components/teams/team-profile/team-profile-details/team-profile-details';
import TeamProfileSidebar from '../../components/teams/team-profile/team-profile-sidebar/team-profile-sidebar';

interface TeamProps {
  team: ITeam;
  members: IMemberWithTeams[];
  backLink: string;
}

export default function Team({ team, members, backLink }: TeamProps) {
  const router = useRouter();
  const breadcrumbItems: IBreadcrumbItem[] = [
    { label: 'Teams', href: backLink },
    { label: team.name },
  ];

  useEffect(() => {
    if (router.query.backLink) {
      const { backLink, ...query } = router.query;
      router.replace({ query }, undefined, { shallow: true });
    }
  }, [router]);

  return (
    <section className="mx-10 my-3">
      <Head>
        <title>Team {team.name}</title>
      </Head>

      <div className="flex items-center justify-between">
        <Breadcrumb items={breadcrumbItems} />
        <AskToEditLink profileType="team" profileName={team.name} />
      </div>

      <div className="mt-6 flex space-x-10">
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
  const { id, backLink = '/teams' } = query as {
    id: string;
    backLink: string;
  };
  const team = await airtableService.getTeam(id);
  const members = await airtableService.getTeamMembers(team.name);

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
