import { ReactElement } from 'react';
import { Breadcrumb } from '@protocol-labs-network/ui';
import { NextSeo } from 'next-seo';
import { EditMemberModal } from '../../../../components/members/member-enrollment/editmember';
import { useProfileBreadcrumb } from '../../../../hooks/profile/use-profile-breadcrumb.hook';
import { DirectoryLayout } from '../../../../layouts/directory-layout';
import { DIRECTORY_SEO } from '../../../../seo.config';
import { IMember } from '../../../../utils/members.types';

interface IAccountSettingsProp {
  id: string;
  backLink: string;
  isUserLoggedIn: boolean;
  userInfo: any;
}

export default function AccountSettings({
  id,
  backLink,
  userInfo,
  isUserLoggedIn,
}: IAccountSettingsProp) {
  const { breadcrumbItems } = useProfileBreadcrumb({
    backLink,
    directoryName: 'Members',
    pageName: `${id}`,
  });
  breadcrumbItems.push({ label: 'Account Settings' });
  return (
    <>
      <NextSeo {...DIRECTORY_SEO} title={userInfo.name} />
      <Breadcrumb items={breadcrumbItems} />
      <div className="mt-20 flex w-full">
        <EditMemberModal
          isOpen={false}
          setIsModalOpen={() => {}}
          id={id}
          isProfileSettings={true}
        />
      </div>
    </>
  );
}

AccountSettings.getLayout = function getLayout(page: ReactElement) {
  return <DirectoryLayout>{page}</DirectoryLayout>;
};

export const getServerSideProps = async ({ query, res, req }) => {
  const userInfo = req?.cookies?.userInfo ? JSON.parse(req?.cookies?.userInfo) : {};
  const isUserLoggedIn = req?.cookies?.authToken &&  req?.cookies?.userInfo ? true : false
  console.log(req.query)
  const { id, backLink = '/directory/members' } = query as {
    id: string;
    backLink: string;
  };
  if (userInfo?.uid != id) {
    return {
      notFound: true,
    };
  }
  res.setHeader(
    'Cache-Control',
    'public, max-age=1, s-maxage=1, stale-while-revalidate=604800'
  );
  return {
    props: { backLink, id, isUserLoggedIn, userInfo },
  };
};
