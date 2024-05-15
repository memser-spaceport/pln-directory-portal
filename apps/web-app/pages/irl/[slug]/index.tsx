import { getTeams } from '@protocol-labs-network/teams/data-access';
import Banner from 'apps/web-app/components/irl/banner';
import HeaderStrip from 'apps/web-app/components/irl/header-strip';
import IrlMain from 'apps/web-app/components/irl/irl-main';
import Navbar from 'apps/web-app/components/irl/navbar';
import ScrollToTop from 'apps/web-app/components/shared/scroll-to-top';
import { DirectoryLayout } from 'apps/web-app/layouts/directory-layout';
import { IRL_SEO } from 'apps/web-app/seo.config';
import { getEventDetailBySlug } from 'apps/web-app/services/irl.service';
import {
  authenticate,
  convertCookiesToJson,
  renewAndStoreNewAccessToken,
} from 'apps/web-app/utils/services/auth';
import { parseCookie } from 'apps/web-app/utils/shared.utils';
import { GetServerSideProps } from 'next';
import { NextSeo } from 'next-seo';
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

  return (
    <>
      <NextSeo
        {...IRL_SEO}
        title={eventDetails.name}
        description={eventDetails.description}
      />
      <div className="flex justify-center pt-[76px] lg:pt-[122px]">
        <div className="flex w-[calc(100%_-_1px)] flex-col items-center lg:w-[900px] lg:px-0">
          <div className="h-9 w-full lg:h-[unset] lg:pb-2">
            <Navbar eventDetails={eventDetails} />
          </div>
          <div className="mb-[2px] w-[calc(100%_-_2px)] bg-white shadow-md lg:rounded-[8px]">
            <Banner
              eventDetails={eventDetails}
              isUserLoggedIn={isUserLoggedIn}
            />
          </div>
          {!isUserLoggedIn && !eventDetails?.isPastEvent && (
            <div className="sticky top-[40px] mt-[0px] w-full lg:top-[83px] lg:mt-[16px]">
              <HeaderStrip eventDetails={eventDetails} />
            </div>
          )}
          <IrlMain
            eventDetails={eventDetails}
            onLogin={onLogin}
            userInfo={userInfo}
            isUserGoing={isUserGoing}
            isUserLoggedIn={isUserLoggedIn}
            teams={teams}
          />
        </div>
        <div>
          <ScrollToTop pageName="Irl Detail" />
        </div>
      </div>
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
  const isUserLoggedIn = cookies?.authToken && cookies?.userInfo;
  const authToken = parseCookie(cookies?.authToken);
  const eventDetails = await getEventDetailBySlug(slug, authToken);
  const type = eventDetails?.type;

  //sorted by guests createdAt
  const sortedGuests = eventDetails?.guests?.sort(
    (a, b) => new Date(b?.createdAt)?.getTime() - new Date(a?.createdAt)?.getTime()
  );

  //has current user is going for an event
  const isUserGoing = sortedGuests?.some(
    (guest) => guest.memberUid === userInfo?.uid && guest?.memberUid
  );

  if (isUserGoing) {
    const currentUser = [...sortedGuests]?.find(
      (v) => v.memberUid === userInfo?.uid
    );
    if (currentUser) {
      const filteredList = [...sortedGuests].filter(
        (v) => v.memberUid !== userInfo?.uid
      );
      const formattedGuests = [currentUser, ...filteredList];
      eventDetails.guests = formattedGuests;
    }
  }

  if (type === 'INVITE_ONLY' && (!isUserLoggedIn || !isUserGoing)) {
    return {
      redirect: {
        permanent: true,
        destination: '/irl',
      },
    };
  }

  if (eventDetails.errorCode === 404) {
    return {
      notFound: true,
    };
  }

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
