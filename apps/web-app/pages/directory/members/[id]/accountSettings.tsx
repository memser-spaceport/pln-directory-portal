import {
  getMember,
  getMemberUIDByAirtableId,
} from '@protocol-labs-network/members/data-access';
import { ReactElement } from 'react';
import { Breadcrumb } from '@protocol-labs-network/ui';
import { NextSeo } from 'next-seo';
import { EditMemberModal } from '../../../../components/members/member-enrollment/editmember';
import { useProfileBreadcrumb } from '../../../../hooks/profile/use-profile-breadcrumb.hook';
import { DirectoryLayout } from '../../../../layouts/directory-layout';
import { DIRECTORY_SEO } from '../../../../seo.config';
import { parseMember } from '../../../../utils/members.utils';
import { IMember } from '../../../../utils/members.types';

interface IAccountSettingsProp {
  id: string;
  backLink: string;
  userInfo: any;
  member: IMember;
}

export default function AccountSettings({
  id,
  backLink,
  userInfo,
  member
}: IAccountSettingsProp) {
  const { breadcrumbItems } = useProfileBreadcrumb({
    backLink,
    directoryName: 'Members',
    pageName: `${member.name}`,
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
  const isUserLoggedIn = req?.cookies?.authToken &&  req?.cookies?.userInfo ? true : false;
  const { id, backLink = '/directory/members' } = query as {
    id: string;
    backLink: string;
  };
  if (userInfo?.uid != id) {
    return {
      notFound: true,
    };
  }

  const memberResponse = await getMember(id, {
    with: 'image,skills,location',
  });
  
  let member; 
  if (memberResponse.status === 200) {
    member = parseMember(memberResponse.body);
  }

  // Redirects user to the 404 page if response from
  // getMember is undefined or the member has no teams
  if (!member) {
    return {
      notFound: true,
    };
  }
  res.setHeader(
    'Cache-Control',
    'no-cache, no-store, max-age=0, must-revalidate'
  );

  return {
    props: { backLink, id, isUserLoggedIn, userInfo, member},
  };
};
