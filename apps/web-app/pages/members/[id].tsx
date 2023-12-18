import {
  getMember,
  getMemberPreferences,
  getMemberUIDByAirtableId,
} from '@protocol-labs-network/members/data-access';
import { getTeams } from '@protocol-labs-network/teams/data-access';
import { Breadcrumb } from '@protocol-labs-network/ui';
import Cookies from 'js-cookie';
import { NextSeo } from 'next-seo';
import { ReactElement, useEffect } from 'react';
import { toast } from 'react-toastify';
import { ADMIN_ROLE, APP_ANALYTICS_EVENTS, LOGGED_IN_MSG, PRIVACY_CONSTANTS, SCHEDULE_MEETING_MSG, SETTINGS_CONSTANTS } from '../../constants';
import { TagsGroup } from '../../components/shared/tags-group/tags-group';
import { MemberProfileDetails } from '../../components/members/member-profile/member-profile-details/member-profile-details';
import { MemberProfileHeader } from '../../components/members/member-profile/member-profile-header/member-profile-header';
import { MemberProfileOfficeHours } from '../../components/members/member-profile/member-profile-office-hours/member-profile-office-hours';
import { MemberProfileTeams } from '../../components/members/member-profile/member-profile-teams';
import { MemberProfileProjects } from '../../components/members/member-profile/member-project-details/member-profile-projects';
import { AskToEditCard } from '../../components/shared/profile/ask-to-edit-card/ask-to-edit-card';
import { AIRTABLE_REGEX } from '../../constants';
import { useProfileBreadcrumb } from '../../hooks/profile/use-profile-breadcrumb.hook';
import { DirectoryLayout } from '../../layouts/directory-layout';
import { DIRECTORY_SEO } from '../../seo.config';
import { IMember, IGitRepositories } from '../../utils/members.types';
import { parseMember, restrictMemberInfo } from '../../utils/members.utils';
import { ITeam } from '../../utils/teams.types';
import { parseTeam } from '../../utils/teams.utils';
import {
  renewAndStoreNewAccessToken,
  convertCookiesToJson,
} from '../../utils/services/auth';
import {
  fetchGitProjectsByMember
} from '../../utils/services/members';
import { MemberProfileLoginStrip } from '../../components/members/member-profile/member-profile-login-strip/member-profile-login-strip';
import MemberExperience from 'apps/web-app/components/members/member-profile/member-experience/member-experience';
import { useRouter } from 'next/router';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { cookiePrefix } from "../../utils/common.utils";

interface MemberProps {
  member: IMember;
  teams: ITeam[];
  backLink: string;
  isUserLoggedIn: boolean;
  userInfo: any;
  officeHoursFlag: boolean;
}

export default function Member({
  member,
  teams,
  backLink,
  userInfo,
  officeHoursFlag
}: MemberProps) {
  const { breadcrumbItems } = useProfileBreadcrumb({
    backLink,
    directoryName: 'Members',
    pageName: member.name,
  });
  const description = member.mainTeam
    ? `${member.mainTeam.role} at ${member.mainTeam.name}`
    : 'Contributor';
  const isEditable = (userInfo.uid === member.id ||
    (userInfo.roles?.length > 0 &&
      userInfo.roles.includes('DIRECTORYADMIN')))
  const isOwner = userInfo?.uid === member?.id;
  const memberProjectContributions = member?.projectContributions ?? [];
  const router = useRouter();
  const analytics = useAppAnalytics();
  const onEditOrAdd  = () => {
    if(isOwner) {
      analytics.captureEvent(APP_ANALYTICS_EVENTS.MEMBER_PR_CONTRIBUTIONS_ADD, {
        member: member,
      })
      router.push({pathname: '/settings', query: {tab: 'contributions'}}, '/settings')
    } else {
      const query = { id: member?.id, tab: 'contributions', name: member?.name, logo: member?.image, from: SETTINGS_CONSTANTS.MEMBER };
      router.push({
        pathname: '/settings',
        query
      }, '/settings');
    }
}

  useEffect(() => {
    const params = Cookies.get(`${cookiePrefix()}page_params`);
    if (params === 'schedule_meeting') {
      toast.info(LOGGED_IN_MSG + ', ' + SCHEDULE_MEETING_MSG, {
        hideProgressBar: true,
      });
    } else if (params === 'user_logged_in') {
      toast.info(LOGGED_IN_MSG, {
        hideProgressBar: true,
      });
    }
    Cookies.remove(`${cookiePrefix()}page_params`);
  }, []);

  return (
    <>
      <NextSeo
        {...DIRECTORY_SEO}
        title={member.name}
        description={description}
      />

      <Breadcrumb items={breadcrumbItems} classname="max-w-[150px] truncate" />

      <section className="space-x-7.5 mx-auto mb-10 w-[917px] max-w-[917px] px-10 pt-40">
        <div className="">
          {!userInfo?.uid && (
            <MemberProfileLoginStrip member={member} userInfo={userInfo} />
          )}
          <div className="shadow-card--slate-900 p-7.5 w-full rounded-b-xl bg-white text-sm">
            <MemberProfileHeader member={member} userInfo={userInfo} />
            <div className="mt-6">
              {member.skills?.length ? (
                <TagsGroup items={member.skills.map((skill) => skill.title)} />
              ) : ('-')}
            </div>
            {userInfo?.uid && (
              <MemberProfileDetails member={member} userInfo={userInfo} />
            )}
            <MemberProfileOfficeHours
              url={member.officeHours}
              userInfo={userInfo}
              member={member}
              officeHoursFlag={officeHoursFlag}
            />
            <MemberProfileTeams teams={teams} member={member} />
            
            {userInfo?.uid && memberProjectContributions.length > 0 && <MemberExperience member={member} isOwner={isOwner} isEditable={isEditable} contributions={member.projectContributions} />}

            {userInfo?.uid && (memberProjectContributions.length === 0 && isEditable) && <div className="text-[#64748B] mt-[20px] text-[15px] font-[500]">
              <div className='font-medium text-slate-500'>Project Experience</div>
              <div className="mt-[10px] rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)]">
                <p className="text-[#0F172A] font-[400] text-[12px] p-[16px]"><span onClick={onEditOrAdd} className="text-[#156FF7] cursor-pointer">Click here</span> to add your experience & contribution details.</p>
              </div>

            </div>}
            {userInfo?.uid && (
              <MemberProfileProjects
                repositories={member?.repositories}
                userInfo={userInfo}
                member={member}
              />
            )}  
          </div>
        </div>
        {/* <div className="w-sidebar shrink-0">
          <AskToEditCard profileType="member" member={member} />
        </div> */}
      </section>
    </>
  );
}

Member.getLayout = function getLayout(page: ReactElement) {
  return <DirectoryLayout>{page}</DirectoryLayout>;
};

const hidePreferences = (preferences, member) => {
  if (!preferences?.showEmail) {
    delete member['email'];
  }
  if (!preferences?.showDiscord) {
    delete member['discordHandle'];
  }
  if (!preferences?.showGithubHandle) {
    delete member['githubHandle'];
  }
  if (!preferences?.showTelegram) {
    delete member['telegramHandle'];
  }
  if (!preferences?.showLinkedin) {
    delete member['linkedinHandle'];
  }
  if (!preferences?.showGithubProjects) {
    delete member['repositories'];
  }
  if (!preferences?.showTwitter) {
    delete member['twitter'];
  }
}

export const getServerSideProps = async (ctx) => {
  const { query, res, req } = ctx;

  let cookies = req?.cookies;
  if (!cookies?.authToken) {
    await renewAndStoreNewAccessToken(cookies?.refreshToken, ctx);
    if (ctx.res.getHeader('Set-Cookie'))
      cookies = convertCookiesToJson(ctx.res.getHeader('Set-Cookie'));
  }
  const userInfo = cookies?.userInfo ? JSON.parse(cookies?.userInfo) : {};
  const isUserLoggedIn = cookies?.authToken && cookies?.userInfo ? true : false;
  const { id, backLink = '/members' } = query as {
    id: string;
    backLink: string;
  };
  let member: IMember;
  let teams: ITeam[];

  // Check if provided ID is an Airtable ID, and if so, get the corresponding backend UID
  if (AIRTABLE_REGEX.test(id)) {
    const memberUID = await getMemberUIDByAirtableId(id);

    return memberUID
      ? {
        redirect: {
          permanent: true,
          destination: `/members/${memberUID}`,
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
    member = isUserLoggedIn ? parseMember(memberResponse.body) : restrictMemberInfo(parseMember(memberResponse.body))
    teams = memberTeamsResponse.body.map(parseTeam);
  }

  // Redirects user to the 404 page if response from
  // getMember is undefined or the member has no teams
  if (!member) {
    return {
      notFound: true,
    };
  }

  let officeHoursFlag = false;
  officeHoursFlag = member['officeHours'] ? true : false;
  if (!isUserLoggedIn && member['officeHours']) {
    delete member['officeHours'];
  }

  if (cookies?.authToken) {
    member.repositories = await fetchGitProjectsByMember(member.id);
  }

  if (cookies?.authToken && (!userInfo?.roles?.includes(ADMIN_ROLE) || userInfo?.uid === member?.id)) {

    let memberPreferences = member?.preferences;
    let preferences;
    if (!memberPreferences) {
      preferences = JSON.parse(JSON.stringify(PRIVACY_CONSTANTS.DEFAULT_SETTINGS));
    } else {
      preferences = memberPreferences;
    }
    hidePreferences(preferences, member);
  }


  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  res.setHeader(
    'Cache-Control',
    'no-cache, no-store, max-age=0, must-revalidate'
  );

  if (member?.preferences) {
    delete member.preferences
  }
  return {
    props: { member, teams, backLink, isUserLoggedIn, userInfo, officeHoursFlag },
  };
};
