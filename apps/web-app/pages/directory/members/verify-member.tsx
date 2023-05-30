import { GetServerSideProps } from 'next';
import nookies from 'nookies';
import { setCookie } from 'nookies';
import { ReactElement } from 'react';
import { LoadingIndicator } from '../../../components/shared/loading-indicator/loading-indicator';
import { PAGE_ROUTES } from '../../../constants';
import {
  getAccessToken,
  decodeToken,
  calculateExpiry,
} from '../../../utils/services/auth';

type VerifyMember = {
  loading: boolean;
};

export default function VerifyMember({ loading = true }: VerifyMember) {
  return (
    <div
      className={`fixed left-0 top-20 z-50 flex h-[calc(100%_-_80px)] w-full items-center justify-center bg-slate-100/50 transition-[visibility,_opacity] duration-[0s,_300ms] ease-[linear,_linear] ${
        loading
          ? 'visible opacity-100 delay-[0s,0s]'
          : 'invisible opacity-0 delay-[300ms,0s]'
      }`}
    >
      <LoadingIndicator />
    </div>
  );
}

VerifyMember.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export const getServerSideProps: GetServerSideProps<VerifyMember> = async (
  ctx
) => {
  const { query } = ctx;
  const { state, code, error } = query;
  const cookies = nookies.get(ctx);
  // validating state which we gave to auth service to get auth code.
  if (cookies.state && cookies.state != state) {
    return {
      redirect: {
        permanent: false,
        destination: PAGE_ROUTES.MEMBERS,
      },
    };
  }
  // it will trigger when we get error from auth service.
  if (error?.length > 0) {
    setCookie(ctx, 'page_params', 'auth_error' , {
      maxAge: Math.round((Date.now() + (60 * 1))/1000),
      path: '/',
    });
    return {
      redirect: {
        permanent: false,
        destination: PAGE_ROUTES.MEMBERS,
      }
    };
  }
  const authResp = await getAccessToken(code);
  if (authResp.status === 403) {
    setCookie(ctx, 'verified', 'false' , {
      path: '/',
    });
    return {
      redirect: {
        permanent: false,
        destination: PAGE_ROUTES.MEMBERS,
      },
    };
  } else if(authResp.status === 400 || authResp.status === 500 || authResp.status === 404 ) {
    setCookie(ctx, 'page_params', 'server_error' , {
      maxAge: Math.round((Date.now() + (60 * 1))/1000),
      path: '/',
    });
    return {
      redirect: {
        permanent: false,
        destination: PAGE_ROUTES.MEMBERS,
      },
    };
  }
  // Set access token, refresh token, member Info in cookie.
  const { accessToken, refreshToken, userInfo, notificationToken, idToken } = authResp.data;
  if (accessToken && refreshToken && userInfo) {
    const accessTokenExpiry = decodeToken(accessToken);
    const refreshTokenExpiry = decodeToken(refreshToken);
    setCookie(ctx, 'authToken', JSON.stringify(accessToken), {
      maxAge: calculateExpiry(accessTokenExpiry.exp),
      path: '/'
    });
    setCookie(ctx, 'refreshToken', JSON.stringify(refreshToken), {
      maxAge: calculateExpiry(refreshTokenExpiry.exp),
      path: '/'
    });
    setCookie(ctx, 'userInfo', JSON.stringify(userInfo), {
      maxAge: calculateExpiry(accessTokenExpiry.exp),
      path: '/'
    });
    setCookie(ctx, 'verified', 'true' , {
      path: '/'
    });
  } else if (notificationToken && accessToken && refreshToken) {
    const accessTokenExpiry = decodeToken(accessToken);
    const refreshTokenExpiry = decodeToken(refreshToken);
    const notificationTokenExpiry = decodeToken(notificationToken);

    setCookie(ctx, 'authToken', accessToken, {
      maxAge: calculateExpiry(accessTokenExpiry.exp),
      path: '/'
    });
    setCookie(ctx, 'idToken', idToken, {
      maxAge: calculateExpiry(accessTokenExpiry.exp),
      path: '/'
    });
    setCookie(ctx, 'refreshToken', refreshToken, {
      maxAge: calculateExpiry(refreshTokenExpiry.exp),
      path: '/'
    });

    setCookie(ctx, 'notificationToken', notificationToken, {
      maxAge: calculateExpiry(notificationTokenExpiry.exp),
      path: '/'
    });
  }
  return {
    redirect: {
      permanent: false,
      destination: PAGE_ROUTES.MEMBERS,
    },
  };
};
