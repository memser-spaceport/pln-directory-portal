import ChangeLogs from 'apps/web-app/components/changeLog/change-logs';
import { DirectoryLayout } from 'apps/web-app/layouts/directory-layout';
import { DIRECTORY_SEO } from 'apps/web-app/seo.config';
import {
  convertCookiesToJson,
  renewAndStoreNewAccessToken,
} from 'apps/web-app/utils/services/auth';
import { GetServerSideProps } from 'next';
import { NextSeo } from 'next-seo';
import { destroyCookie } from 'nookies';
import { ReactElement } from 'react';

export default function ChangeLog() {
  return (
    <>
    <NextSeo {...DIRECTORY_SEO} title="Changelog" />
    <section className="flex justify-center pt-20">
      <div className="my-8 flex w-[800px] flex-col gap-5 ">
        <h1 className="color-[#0F172A] text-[24px] font-bold leading-5">
          Changelog
        </h1>
        <ChangeLogs />
      </div>
    </section>
    </>
  );
}

ChangeLog.getLayout = function getLayout(page: ReactElement) {
  return <DirectoryLayout>{page}</DirectoryLayout>;
};

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { req } = ctx;
  let cookies = req?.cookies;
  if (!cookies?.authToken) {
    await renewAndStoreNewAccessToken(cookies?.refreshToken, ctx);
    if (ctx.res.getHeader('Set-Cookie'))
      cookies = convertCookiesToJson(ctx.res.getHeader('Set-Cookie'));
  }
  destroyCookie(null, 'state');
  const userInfo = cookies?.userInfo ? JSON.parse(cookies?.userInfo) : {};
  const isUserLoggedIn = cookies?.authToken && cookies?.userInfo ? true : false;
  return {
    props: {
      isUserLoggedIn,
      userInfo,
    },
  };
};
