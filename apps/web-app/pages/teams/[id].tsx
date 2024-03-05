import { getMembers } from '@protocol-labs-network/members/data-access';
import {
  getTeam,
  getTeamUIDByAirtableId,
} from '@protocol-labs-network/teams/data-access';
import { Breadcrumb } from '@protocol-labs-network/ui';
import orderBy from 'lodash/orderBy';
import { GetServerSideProps } from 'next';
import { NextSeo } from 'next-seo';
import { ReactElement } from 'react';
import { AskToEditCard } from '../../components/shared/profile/ask-to-edit-card/ask-to-edit-card';
import { TeamProfileDetails } from '../../components/teams/team-profile/team-profile-details/team-profile-details';
import { TeamProfileFunding } from '../../components/teams/team-profile/team-profile-funding/team-profile-funding';
import { TeamProfileHeader } from '../../components/teams/team-profile/team-profile-header/team-profile-header';
import { TeamProfileMembers } from '../../components/teams/team-profile/team-profile-members/team-profile-members';
import { AIRTABLE_REGEX } from '../../constants';
import { useProfileBreadcrumb } from '../../hooks/profile/use-profile-breadcrumb.hook';
import { DirectoryLayout } from '../../layouts/directory-layout';
import { DIRECTORY_SEO } from '../../seo.config';
import { IMember } from '../../utils/members.types';
import {
  restrictMemberInfo,
  parseTeamMember,
} from '../../utils/members.utils';
import { ITeam } from '../../utils/teams.types';
import { parseTeam } from '../../utils/teams.utils';
import { renewAndStoreNewAccessToken, convertCookiesToJson} from '../../utils/services/auth';
import TeamProfileProjects from 'apps/web-app/components/teams/team-profile/team-profile-projects/team-profile-projects';
import ProjectsService from 'apps/web-app/services/projects';
import { getAllFormattedProjects } from 'apps/web-app/services/projects/projects.data.service';

interface TeamProps {
  team: ITeam;
  members: IMember[];
  backLink: string;
  isUserLoggedIn: boolean;
  userInfo: any;
  teamsProjectList:any;
  hasProjectsEditAccess: boolean;
}

export default function Team({ team, members, backLink, userInfo, teamsProjectList, hasProjectsEditAccess, isUserLoggedIn }: TeamProps) {
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

      <Breadcrumb items={breadcrumbItems} classname="max-w-[150px] truncate"/>
      <section className="space-x-7.5 mx-auto mb-10 w-[917px] max-w-[917px] px-10 pt-40">
        <div className="card p-7.5 w-full">
          <TeamProfileHeader team={team} loggedInMember={userInfo} />
          <TeamProfileDetails {...team} />
          {team.fundingStage || team.membershipSources.length ? (
            <TeamProfileFunding {...team} />
          ) : null}
          <TeamProfileMembers members={members} />
          <TeamProfileProjects projects={teamsProjectList} isUserLoggedIn={isUserLoggedIn} team={team} hasProjectsEditAccess={hasProjectsEditAccess}/>

        </div>
        {/* <div className="w-sidebar shrink-0">
          <AskToEditCard profileType="team" team={team} />
        </div> */}
      </section>
    </>
  );
}

Team.getLayout = function getLayout(page: ReactElement) {
  return <DirectoryLayout>{page}</DirectoryLayout>;
};

export const getServerSideProps: GetServerSideProps<TeamProps> = async (ctx) => {
  const {
    query,
    res,
    req
  } = ctx;
  let cookies = req?.cookies;
  if (!cookies?.authToken) {
    await renewAndStoreNewAccessToken(cookies?.refreshToken, ctx);
    if (ctx.res.getHeader('Set-Cookie'))
      cookies = convertCookiesToJson(ctx.res.getHeader('Set-Cookie'));
  }
  const userInfo = cookies?.userInfo ? JSON.parse(cookies?.userInfo) : {};
  const isUserLoggedIn = cookies?.authToken &&  cookies?.userInfo ? true : false;
  let hasProjectsEditAccess = false;
  const { id, backLink = '/teams' } = query as {
    id: string;
    backLink: string;
  };
  let team: ITeam;
  let members: IMember[];

  // Check if provided ID follows the Airtable ID format (reqXXXXXXXXXXXXXX), and if so, get the corresponding UID for the team from the web api
  if (AIRTABLE_REGEX.test(id)) {
    const teamUID = await getTeamUIDByAirtableId(id);

    return teamUID
      ? {
          redirect: {
            permanent: true,
            destination: `/teams/${teamUID}`,
          },
        }
      : {
          notFound: true,
        };
  }

  const [teamResponse, teamMembersResponse] = await Promise.all([
    getTeam(id, {
      with: 'logo,technologies,membershipSources,industryTags,fundingStage,teamMemberRoles.member',
    }),
    getMembers({
      'teamMemberRoles.team.uid': id,
      select:
        'uid,name,image.url,skills.title,teamMemberRoles.team.uid,projectContributions,teamMemberRoles.team.name,teamMemberRoles.role,teamMemberRoles.teamLead,teamMemberRoles.mainTeam',
      pagination: false,
    }),
  ]);

  if (teamResponse.status === 200 && teamMembersResponse.status === 200) {
    team = parseTeam(teamResponse.body);
    members = orderBy(
      teamMembersResponse.body.map((member) =>
        isUserLoggedIn ? parseTeamMember(member, team.id) : restrictMemberInfo(parseTeamMember(member, team.id))
      ),
      ['teamLead', 'name'],
      ['desc', 'asc']
    );
    for(const mem of members){
      if(mem.id === userInfo.uid){
        hasProjectsEditAccess = true;
        break;
      }
    }
  }

  
  if(userInfo.roles && userInfo.roles.length && userInfo.roles.includes('DIRECTORYADMIN')){
    hasProjectsEditAccess = true;
  }


  let teamsProjectList = [];
  const currentTeam = teamResponse?.body as ITeam
  try{
    teamsProjectList = getAllFormattedProjects([...currentTeam.maintainingProjects, ...currentTeam.contributingProjects])
  }catch(err){
    console.log(err);
  }

  // Redirects user to the 404 page when we're unable to fetch
  // a valid team with the provided ID
  if (!team) {
    return {
      notFound: true,
    };
  }

  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days.
  res.setHeader(
    'Cache-Control',
    'no-cache, no-store, max-age=0, must-revalidate'
  );

  return {
    props: { team, members, backLink, isUserLoggedIn, userInfo, teamsProjectList, hasProjectsEditAccess },
  };
};
