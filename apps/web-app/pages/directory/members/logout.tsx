import { GetServerSideProps } from 'next';
import nookies from 'nookies';
import { destroyCookie } from 'nookies';
import { ReactElement } from 'react';
import { LoadingIndicator } from '../../../components/shared/loading-indicator/loading-indicator';

type VerifyMember = {
  loading: boolean;
};

export default function Logout({ loading = true }: VerifyMember) {
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

Logout.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export const getServerSideProps: GetServerSideProps<VerifyMember> = async (
  ctx
) => {
  destroyCookie(ctx, 'authToken', {
    path: '/',
  });
  destroyCookie(ctx, 'refreshToken', {
    path: '/',
  });
  destroyCookie(ctx, 'member', {
    path: '/',
  });
  return {
    redirect: {
      permanent: false,
      destination: '/directory/teams',
    },
  };
};
