import { GetServerSideProps } from 'next';
import nookies, { destroyCookie } from 'nookies';
import { setCookie } from 'nookies';
import { ReactElement } from 'react';
import { LoadingIndicator } from '../../../components/shared/loading-indicator/loading-indicator';
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
  const { query, res } = ctx;
  const { state, code } = query;
  const cookies = nookies.get(ctx);
  // validating state which we gave to auth service to get auth code.
  if (cookies.state && cookies.state != state) {
    destroyCookie(null, 'state');
    return {
      redirect: {
        permanent: false,
        destination: '/directory/members?verified=false',
      },
    };
  }
  const authResp = await getAccessToken(code);
  if (authResp.status === 401 || authResp.status === 403) {
    setCookie(ctx, 'verified', 'false' , {
      maxAge: Math.round((Date.now() + (60 * 10))/1000),
      path: '/',
      // httpOnly: true,
      // secure: true,
      // sameSite: 'strict',
    });
    return {
      redirect: {
        permanent: false,
        destination: '/directory/members',
      },
    };
  }
  // Set access token, refresh token, member Info in cookie.
  const { accessToken, refreshToken, userInfo } = authResp.data;
  if (accessToken && refreshToken && userInfo) {
    const accessTokenExpiry = decodeToken(accessToken);
    const refreshTokenExpiry = decodeToken(refreshToken);
    setCookie(ctx, 'authToken', JSON.stringify(accessToken), {
      maxAge: calculateExpiry(accessTokenExpiry.exp),
      path: '/',
      // httpOnly: true,
      // secure: true,
      // sameSite: 'strict',
    });
    setCookie(ctx, 'refreshToken', JSON.stringify(refreshToken), {
      maxAge: calculateExpiry(refreshTokenExpiry.exp),
      path: '/',
      // httpOnly: true,
      // secure: true,
      // sameSite: 'strict',
    });
    setCookie(ctx, 'userInfo', JSON.stringify(userInfo), {
      maxAge: calculateExpiry(accessTokenExpiry.exp),
      path: '/',
      // httpOnly: true,
      // secure: true,
      // sameSite: 'strict',
    });

    setCookie(ctx, 'verified', 'true' , {
      maxAge: Math.round((Date.now() + (60 * 10))/1000),
      path: '/',
      // httpOnly: true,
      // secure: true,
      // sameSite: 'strict',
    });
  }

  return {
    redirect: {
      permanent: false,
      destination: '/directory/members',
    },
  };
};