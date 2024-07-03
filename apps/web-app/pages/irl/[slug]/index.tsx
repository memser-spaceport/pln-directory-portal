import { getMember, getMemberPreferences } from '@protocol-labs-network/members/data-access';
import Banner from 'apps/web-app/components/irl/banner';
import HeaderStrip from 'apps/web-app/components/irl/header-strip';
import IrlMain from 'apps/web-app/components/irl/irl-main';
import Navbar from 'apps/web-app/components/irl/navbar';
import Resources from 'apps/web-app/components/irl/resources';
import ScrollToTop from 'apps/web-app/components/shared/scroll-to-top';
import { ADMIN_ROLE } from 'apps/web-app/constants';
import { DirectoryLayout } from 'apps/web-app/layouts/directory-layout';
import { IRL_SEO } from 'apps/web-app/seo.config';
import { getEventDetailBySlug } from 'apps/web-app/services/irl.service';
import { isPastDate, removeCookieInserverSide, sortByDefault } from 'apps/web-app/utils/irl.utils';
import { authenticate, convertCookiesToJson, decodeToken, renewAndStoreNewAccessToken } from 'apps/web-app/utils/services/auth';
import { parseCookie } from 'apps/web-app/utils/shared.utils';
import { GetServerSideProps } from 'next';
import { NextSeo } from 'next-seo';
import { useRouter } from 'next/router';
import { ReactElement } from 'react';
import Cookies from 'js-cookie'
import { destroyCookie } from 'nookies';

export default function IrlDetails({ eventDetails, teams, userInfo, isUserGoing, isUserLoggedIn, showTelegram }) {
  const router = useRouter();
  const onLogin = () => {
    if(Cookies.get("refreshToken")) {
      Cookies.set('page_params', 'user_logged_in', { expires: 60, path: '/' });
      router.reload();
    } else {
    router.push(`${window.location.pathname}${window.location.search}#login`)
    }
  };

  return (
    <>
      <NextSeo {...IRL_SEO} title={eventDetails.name} description={eventDetails.description} />
      <div className="flex justify-center pt-[76px] lg:pt-[122px]">
        <div className="flex w-[calc(100%_-_1px)] flex-col items-center lg:w-[900px] lg:px-0">
        <div className="h-9 w-full lg:h-[unset] lg:pb-2">
            <Navbar eventDetails={eventDetails} />
          </div>
          <div className='relative z-[2] bg-[#F1F5F9] lg:rounded-[8px]'>
          <div className="mb-[2px] w-[calc(100%_-_2px)] bg-white shadow-sm lg:rounded-[8px] ">
            <Banner eventDetails={eventDetails} isUserLoggedIn={isUserLoggedIn} />
          </div>
          {eventDetails?.resources?.length > 0 && (
            <div className="mt-2 w-full rounded-lg bg-white  p-5 shadow-sm ">
              <Resources eventDetails={eventDetails} isUserLoggedIn={isUserLoggedIn} onLogin={onLogin} />
            </div>
            
          )}
         
          {!isUserLoggedIn && !isPastDate(eventDetails?.endDate) && (
            <div className="sticky top-[40px] mt-[0px] w-full lg:top-[83px] lg:mt-[16px]">
              <HeaderStrip eventDetails={eventDetails} />
            </div>
          )}
           </div>
          <IrlMain
            eventDetails={eventDetails}
            onLogin={onLogin}
            userInfo={userInfo}
            isUserGoing={isUserGoing}
            isUserLoggedIn={isUserLoggedIn}
            teams={teams}
            showTelegram={showTelegram}
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
  try {
    const { query, res, req } = ctx;

    const slug = query.slug;
    let cookies = req?.cookies;
    let teams = [];
    let showTelegram = true;
    if (!cookies?.authToken) {
      await renewAndStoreNewAccessToken(cookies?.refreshToken, ctx);
      if (ctx.res.getHeader('Set-Cookie')) cookies = convertCookiesToJson(ctx.res.getHeader('Set-Cookie'));
    }
    const userInfo = cookies?.userInfo ? JSON.parse(cookies?.userInfo) : {};
    const isUserLoggedIn = cookies?.authToken && cookies?.userInfo ? true : false;
    const authToken = parseCookie(cookies?.authToken);
    const decodedToken = decodeToken(authToken);
    if(decodedToken?.exp) {
      const expiryDate = new Date(decodedToken?.exp * 1000);
      const currentDate = new Date();
      if(currentDate > expiryDate)  {
        removeCookieInserverSide(ctx);
        return {
          redirect: {
            permanent: true,
            destination: `/irl`,
          },
        };
      }
    }

    const eventDetails = await getEventDetailBySlug(slug, authToken);
    const type = eventDetails?.type;

    const sortedList = sortByDefault(eventDetails?.guests);
    eventDetails.guests = sortedList;

    //has current user is going for an event
    const isUserGoing = sortedList?.some((guest) => guest.memberUid === userInfo?.uid && guest?.memberUid);

    if (isUserGoing) {
      const currentUser = [...sortedList]?.find((v) => v.memberUid === userInfo?.uid);
      if (currentUser) {
        const filteredList = [...sortedList].filter((v) => v.memberUid !== userInfo?.uid);
        const formattedGuests = [currentUser, ...filteredList];
        eventDetails.guests = formattedGuests;
      }
    }

    if (type === 'INVITE_ONLY' && !isUserLoggedIn) {
      return {
        redirect: {
          permanent: true,
          destination: '/irl',
        },
      };
    }

    if (type === 'INVITE_ONLY' && isUserLoggedIn && !userInfo?.roles?.includes(ADMIN_ROLE) && !isUserGoing) {
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

      const [memberResponse, memberPreferences] = await Promise.all([
        getMember(uid, {
          with: 'teamMemberRoles.team',
        }),
        getMemberPreferences(uid, cookies.authToken),
      ]);    

      if (memberResponse.status === 200 && memberPreferences.status === 200) {
        teams = memberResponse.body?.teamMemberRoles?.map((teamResponse) => {
          return {
            id: teamResponse?.team?.uid,
            name: teamResponse?.team?.name,
            mainTeam: teamResponse?.mainTeam,
          };
        });
        showTelegram = memberPreferences.body?.showTelegram ?? true;
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
        showTelegram
      })
    );
    return {
      props: pageProps,
    };
  } catch (error) {
    console.log(error);
  }
};
