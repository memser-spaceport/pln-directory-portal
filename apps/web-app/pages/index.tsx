import { GetServerSideProps } from 'next';
import { NextSeo } from 'next-seo';
import { ReactElement } from 'react';
import { PortalDivider } from '../components/portal/portal-divider/portal-divider';
import { Directory } from '../components/portal/sections/directory/directory';
import { Faq } from '../components/portal/sections/faq/faq';
import { Footer } from '../components/portal/sections/footer/footer';
import { LabWeek } from '../components/portal/sections/labweek/labweek';
import { Mission } from '../components/portal/sections/mission/mission';
import { Projects } from '../components/portal/sections/projects/projects';
import { Substack } from '../components/portal/sections/substack/substack';
import { PortalLayout } from '../layouts/portal-layout';

export default function Index() {
  return (
    <>
      <NextSeo
        additionalMetaTags={[
          { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        ]}
      />

      <div>
        <Mission />
        <PortalDivider />
        <div className="bg-white py-24 px-6 sm:px-16 sm:py-[120px]">
          <div className="mx-auto max-w-[1110px]">
            <Directory />
          </div>
        </div>
        <div className="bg-gradient-to-b from-slate-50 to-white">
          <div className="py-24 px-6 sm:px-16 sm:py-[152px]">
            <div className="mx-auto max-w-[1110px]">
              <div className="mb-[106px] sm:mb-[162px]">
                <LabWeek />
              </div>
              <div className="mb-[72px] sm:mb-40">
                <Projects />
              </div>
              <div className="mb-32 sm:mb-48">
                <Substack />
              </div>
              <div className="mx-auto max-w-[800px]">
                <Faq />
              </div>
            </div>
          </div>
          <PortalDivider />
          <Footer />
        </div>
      </div>
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
