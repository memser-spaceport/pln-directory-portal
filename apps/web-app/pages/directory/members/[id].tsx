import {
  getMember,
  getMemberUIDByAirtableId,
} from '@protocol-labs-network/members/data-access';
import { getTeams } from '@protocol-labs-network/teams/data-access';
import { Breadcrumb } from '@protocol-labs-network/ui';
import Cookies from 'js-cookie';
import { NextSeo } from 'next-seo';
import { ReactElement, useEffect } from 'react';
import { toast } from 'react-toastify';
import { LOGGED_IN_MSG, SCHEDULE_MEETING_MSG } from '../../../constants';
import { MemberProfileDetails } from '../../../components/members/member-profile/member-profile-details/member-profile-details';
import { MemberProfileHeader } from '../../../components/members/member-profile/member-profile-header/member-profile-header';
import { MemberProfileOfficeHours } from '../../../components/members/member-profile/member-profile-office-hours/member-profile-office-hours';
import { MemberProfileTeams } from '../../../components/members/member-profile/member-profile-teams';
import { MemberProfileProjects } from '../../../components/members/member-profile/member-project-details/member-profile-projects';
import { AskToEditCard } from '../../../components/shared/profile/ask-to-edit-card/ask-to-edit-card';
import { AIRTABLE_REGEX } from '../../../constants';
import { useProfileBreadcrumb } from '../../../hooks/profile/use-profile-breadcrumb.hook';
import { DirectoryLayout } from '../../../layouts/directory-layout';
import { DIRECTORY_SEO } from '../../../seo.config';
import { IMember, IGitRepositories } from '../../../utils/members.types';
import { parseMember, maskMemberDetails } from '../../../utils/members.utils';
import { ITeam } from '../../../utils/teams.types';
import { parseTeam } from '../../../utils/teams.utils';
import { renewAndStoreNewAccessToken, convertCookiesToJson} from '../../../utils/services/auth';
import { MemberProfileLoginStrip } from '../../../components/members/member-profile/member-profile-login-strip/member-profile-login-strip';

interface MemberProps {
  member: IMember;
  teams: ITeam[];
  backLink: string;
  isUserLoggedIn: boolean;
  userInfo: any;
}

export default function Member({
  member,
  teams,
  backLink,
  userInfo,
}: MemberProps) {
  const { breadcrumbItems } = useProfileBreadcrumb({
    backLink,
    directoryName: 'Members',
    pageName: member.name,
  });
  const description = member.mainTeam
    ? `${member.mainTeam.role} at ${member.mainTeam.name}`
    : 'Contributor';

  useEffect(() => {
    const params = Cookies.get('page_params');
    if (params === 'user_logged_in') {
      toast.info(LOGGED_IN_MSG + ', ' + SCHEDULE_MEETING_MSG, {
        hideProgressBar: true,
      });
    }
    Cookies.remove('page_params');
  }, []);

  return (
    <>
      <NextSeo
        {...DIRECTORY_SEO}
        title={member.name}
        description={description}
      />

      <Breadcrumb items={breadcrumbItems} classname="max-w-[150px] truncate" />

      <section className="space-x-7.5 mx-auto mb-10 flex max-w-7xl px-10 pt-40">
        <div className=''>
          {!userInfo?.uid && (
            <MemberProfileLoginStrip member={member} userInfo={userInfo} />
          )}
          <div className="shadow-card--slate-900 p-7.5 w-full rounded-b-xl bg-white text-sm">
            <MemberProfileHeader member={member} userInfo={userInfo} />
            {userInfo?.uid && (
              <MemberProfileDetails member={member} userInfo={userInfo} />
            )}
            <MemberProfileOfficeHours
              url={member.officeHours}
              userInfo={userInfo}
              member={member}
            />
            <MemberProfileTeams teams={teams} member={member} />
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

export const getServerSideProps = async (ctx) => {
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
  const isMaskingRequired = cookies?.authToken ? false : true;
  const { id, backLink = '/directory/members' } = query as {
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

  // Redirects user to the 404 page if response from
  // getMember is undefined or the member has no teams
  if (!member) {
    return {
      notFound: true,
    };
  }

  if (isMaskingRequired) {
    member = maskMemberDetails({ ...member });
  }

  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  res.setHeader(
    'Cache-Control',
    'no-cache, no-store, max-age=0, must-revalidate'
  );

  return {
    props: { member, teams, backLink, isUserLoggedIn, userInfo },
  };
};
