import { getTeams } from '@protocol-labs-network/teams/data-access';
import Banner from 'apps/web-app/components/irl/banner';
import HeaderStrip from 'apps/web-app/components/irl/header-strip';
import MemberList from 'apps/web-app/components/irl/member-list';
import TableHeader from 'apps/web-app/components/irl/table-header';
import TeamList from 'apps/web-app/components/irl/team-list';
import Toolbar from 'apps/web-app/components/irl/toolbar';
import { DirectoryLayout } from 'apps/web-app/layouts/directory-layout';
import { getEventDetailBySlug } from 'apps/web-app/services/irl.service';
import {
  authenticate,
  convertCookiesToJson,
  renewAndStoreNewAccessToken,
} from 'apps/web-app/utils/services/auth';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { ReactElement } from 'react';

export default function IrlDetails({
  eventDetails,
  teams,
  userInfo,
  isUserGoing,
  isUserLoggedIn,
}) {
  const router = useRouter();
  const onLogin = () => {
    authenticate(router.asPath);
  };

  const onJoin = (value) => {
    document.dispatchEvent(
      new CustomEvent('open-join-modal', { detail: value })
    );
  };

  return (
    <>
      <div className="flex justify-center pt-[70px] lg:pt-[100px]">
        <div className="flex w-[calc(100%_-_1px)] flex-col items-center lg:w-[900px] lg:px-0">
          <div className="h-[345px] w-[calc(100%_-_2px)] bg-white shadow-sm lg:h-[291px] lg:rounded-[8px]">
            <Banner eventDetails={eventDetails} />
          </div>
          <div className="sticky top-[40px] mt-[0px] w-full lg:top-[83px] lg:mt-[16px]">
            {!isUserLoggedIn && <HeaderStrip onJoin={onJoin} />}
          </div>
          <div
            className={`${
              isUserLoggedIn ? 'h-[110px]' : 'h-[152px]'
            } w-[100%] bg-slate-100 px-[16px] pt-[16px] lg:h-[76px] lg:px-0 lg:py-[18px]`}
          >
            <Toolbar
              eventDetails={eventDetails}
              teams={teams}
              userInfo={userInfo}
              isUserGoing={isUserGoing}
              isUserLoggedIn={isUserLoggedIn}
              onLogin={onLogin}
            />
          </div>
          <div className="slim-scroll lg-rounded-tl-[8px] lg-rounded-tr-[8px] mb-[8px] h-[calc(100svh_-_310px)] w-[calc(100%_-_2px)] overflow-y-auto overflow-x-scroll lg:h-[calc(100vh_-_220px)] lg:overflow-x-hidden">
            <TableHeader isUserLoggedIn={isUserLoggedIn} />

            <div
              className={`relative -mt-[4px] ${
                isUserLoggedIn ? 'w-fit' : 'w-full'
              } lg-rounded-[8px] bg-white shadow-sm lg:w-[calc(100%_-_2px)]`}
            >
              {isUserLoggedIn && (
                <MemberList userInfo={userInfo} items={eventDetails.guests} />
              )}
              {!isUserLoggedIn && (
                <TeamList onLogin={onLogin} items={eventDetails.guests} />
              )}
            </div>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          ::-webkit-scrollbar {
            width: 6px;
            background: #f7f7f7;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background-color: #cbd5e1;
            border-radius: 10px;
          }
        `}
      </style>
    </>
  );
}

IrlDetails.getLayout = function getLayout(page: ReactElement) {
  return <DirectoryLayout isIrlPage={true}>{page}</DirectoryLayout>;
};

export const getServerSideProps: GetServerSideProps = async (ctx: any) => {
  const { query, res, req } = ctx;

  const slug = query.slug;
  let cookies = req?.cookies;
  let teams = [];
  if (!cookies?.authToken) {
    await renewAndStoreNewAccessToken(cookies?.refreshToken, ctx);
    if (ctx.res.getHeader('Set-Cookie'))
      cookies = convertCookiesToJson(ctx.res.getHeader('Set-Cookie'));
  }
  const userInfo = cookies?.userInfo ? JSON.parse(cookies?.userInfo) : {};
  const isUserLoggedIn = cookies?.authToken && cookies?.userInfo ? true : false;

  const getAuthToken = (token: string) => {
    try {
      const authToken = JSON.parse(token);
      return authToken;
    } catch {
      return '';
    }
  };

  const authToken = getAuthToken(cookies?.authToken);

  if (isUserLoggedIn) {
    const { uid } = userInfo;
    const memberTeamsResponse = await getTeams({
      'teamMemberRoles.member.uid': uid,
      select:
        'uid,name,logo.url,industryTags.title,teamMemberRoles.role,teamMemberRoles.mainTeam',
      pagination: false,
    });

    if (memberTeamsResponse.status === 200) {
      teams = memberTeamsResponse.body.map((team) => {
        return {
          id: team?.uid,
          name: team?.name,
          logo: team?.logo?.url,
        };
      });
    }
  }

  const eventDetails = await getEventDetailBySlug(slug, authToken);

  if (eventDetails.errorCode === 404) {
    return {
      notFound: true,
    };
  }

  const notAvailableTeams = eventDetails?.guests?.filter(
    (item) => item.teamUid === 'cleeky1re000202tx3kex3knn'
  );
  const otherTeams = eventDetails?.guests?.filter(
    (item) => item.teamUid !== 'cleeky1re000202tx3kex3knn'
  );
  const combinedTeams = [...otherTeams, ...notAvailableTeams];
  eventDetails.guests = combinedTeams;

  const isUserGoing = combinedTeams?.some(
    (guest) => guest.memberUid === userInfo.uid && guest.memberUid
  );

  if (isUserGoing) {
    const currentUser = [...combinedTeams].find(
      (v) => v.memberUid === userInfo.uid
    );
    if (currentUser) {
      currentUser.memberName = `(You) ${currentUser.memberName}`;
      const filteredList = [...combinedTeams].filter(
        (v) => v.memberUid !== userInfo.uid
      );
      const formattedGuests = [currentUser, ...filteredList];
      eventDetails.guests = formattedGuests;
    }
  }

  const pageProps = JSON.parse(
    JSON.stringify({
      userInfo,
      isUserLoggedIn,
      teams,
      isIrlPage: true,
      eventDetails,
      isUserGoing,
    })
  );
  return {
    props: pageProps,
  };
};
