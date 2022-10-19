import { GetServerSideProps } from 'next';
import { NextSeo } from 'next-seo';
import { ReactElement } from 'react';
import { PortalLayout } from '../layouts/portal-layout';

export default function Index() {
  return (
    <>
      <NextSeo
        additionalMetaTags={[
          { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        ]}
      />
    </>
  );
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
