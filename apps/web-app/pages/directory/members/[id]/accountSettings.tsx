import { ReactElement } from 'react';
import { Breadcrumb } from '@protocol-labs-network/ui';
import { NextSeo } from 'next-seo';
import { EditMemberModal } from '../../../../components/members/member-enrollment/editmember';
import { AIRTABLE_REGEX } from '../../../../constants';
import { useProfileBreadcrumb } from '../../../../hooks/profile/use-profile-breadcrumb.hook';
import { DirectoryLayout } from '../../../../layouts/directory-layout';
import { DIRECTORY_SEO } from '../../../../seo.config';
import { IMember } from '../../../../utils/members.types';
import { getMemberFromCookie } from '../../../../utils/members.utils';
interface IAccountSettingsProp {
  id: string;
  backLink: string;
  isUserLoggedIn: boolean;
  member: IMember;
}

export default function AccountSettings({
  id,
  backLink,
  member,
  isUserLoggedIn,
}: IAccountSettingsProp) {
  const { breadcrumbItems } = useProfileBreadcrumb({
    backLink,
    directoryName: 'Members',
    pageName: id,
  });

  return (
    <>
      <NextSeo {...DIRECTORY_SEO} title={member.name} />
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

export const getServerSideProps = async ({ query, res }) => {
  const memberDetails = getMemberFromCookie(res);
  const isUserLoggedIn = memberDetails.isUserLoggedIn;
  const member: IMember = memberDetails.member;
  const { id, backLink = '/directory/members' } = query as {
    id: string;
    backLink: string;
  };
  if (member.id != id && isUserLoggedIn) {
    return {
      redirect: {
        permanent: false,
        destination: '/directory/members',
      },
    };
  }
  return {
    props: { backLink, id, isUserLoggedIn, member: member || {} },
  };
};
