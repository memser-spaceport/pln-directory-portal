import { GetServerSideProps } from 'next';
import { ReactElement } from 'react';
import { PortalLayout } from '../layouts/portal-layout';

export default function Index() {
  return <h1>Network Portal</h1>;
}

Index.getLayout = function getLayout(page: ReactElement) {
  return <PortalLayout>{page}</PortalLayout>;
};

export const getServerSideProps: GetServerSideProps = async () => {
  return process.env.NEXT_PUBLIC_HIDE_NETWORK_PORTAL
    ? {
        redirect: {
          permanent: false,
          destination: '/directory/teams',
        },
      }
    : { props: {} };
};
