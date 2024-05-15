import IrlBanner from 'apps/web-app/components/irl/irl-list/irl-banner';
import { DirectoryLayout } from 'apps/web-app/layouts/directory-layout';
import {
  renewAndStoreNewAccessToken,
  convertCookiesToJson,
} from 'apps/web-app/utils/services/auth';
import { GetServerSideProps } from 'next';
import { destroyCookie } from 'nookies';
import { ReactElement } from 'react';
import styles from './index.module.css';
import IrlHeader from 'apps/web-app/components/irl/irl-list/irl-header';
import { getAllEvents, getUserEvents } from 'apps/web-app/services/irl.service';
import IrlList from 'apps/web-app/components/irl/irl-list/irl-list';
import { NextSeo } from 'next-seo';
import { IRL_SEO } from 'apps/web-app/seo.config';
import { parseCookie } from 'apps/web-app/utils/shared.utils';

export default function Irl({
  conference,
  error,
  userEvents
}) {
  if (error) {
    return;
  }
  return (
    <>
    <NextSeo {...IRL_SEO} title="IRL Gatherings" />
    <section className={styles.irl}>
      <div className={styles.irl__banner}>
        <IrlBanner />
      </div>
      <div className={styles.irl__header}>
        <IrlHeader />
      </div>
      <div className={styles.irl__conferences}>
        <IrlList conference={conference} userEvents={userEvents}/>
      </div>
    </section>
    </>
  );
}

Irl.getLayout = function getLayout(page: ReactElement) {
  return <DirectoryLayout isIrlPage={true}>{page}</DirectoryLayout>;
};

export const getServerSideProps: GetServerSideProps = async (ctx: any) => {
  const { req } = ctx;
  let cookies = req?.cookies;
  let conference = [];
  let userEvents = null;
  let error = false;
  if (!cookies?.authToken) {
    await renewAndStoreNewAccessToken(cookies?.refreshToken, ctx);
    if (ctx.res.getHeader('Set-Cookie'))
      cookies = convertCookiesToJson(ctx.res.getHeader('Set-Cookie'));
  }
  destroyCookie(null, 'state');
  const userInfo = cookies?.userInfo ? JSON.parse(cookies?.userInfo) : {};
  const isUserLoggedIn = cookies?.authToken && cookies?.userInfo ? true : false;
  const authToken = parseCookie(cookies?.authToken);
  const events = await getAllEvents();
  if (events.errorCode) {
    error = true;
  } else {
    conference = events;
  }
  if(isUserLoggedIn){
    userEvents = await getUserEvents(authToken);
    if(!userEvents?.errorCode){
      userEvents.map(event=>event.uid);
    }
  }

  return {
    props: {
      isUserLoggedIn: isUserLoggedIn,
      userInfo: userInfo,
      conference: conference,
      error: error,
      userEvents: userEvents
    },
  };
};
