import {
  getMembers,
  getMembersFilters,
} from '@protocol-labs-network/members/data-access';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { NextSeo } from 'next-seo';
import { ReactElement, useEffect, useState } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import { LoadingOverlay } from '../../../components/layout/loading-overlay/loading-overlay';
import { MembersDirectoryFilters } from '../../../components/members/members-directory/members-directory-filters/members-directory-filters';
import { IMembersFiltersValues } from '../../../components/members/members-directory/members-directory-filters/members-directory-filters.types';
import { parseMembersFilters } from '../../../components/members/members-directory/members-directory-filters/members-directory-filters.utils';
import { MembersDirectoryList } from '../../../components/members/members-directory/members-directory-list/members-directory-list';
import { DirectoryHeader } from '../../../components/shared/directory/directory-header/directory-header';
import { useViewType } from '../../../components/shared/directory/directory-view/use-directory-view-type.hook';
import { useDirectoryFiltersFathomLogger } from '../../../hooks/plugins/use-directory-filters-fathom-logger.hook';
import { DirectoryLayout } from '../../../layouts/directory-layout';
import { DIRECTORY_SEO } from '../../../seo.config';
import { IMember } from '../../../utils/members.types';
import { parseMember, maskMemberDetails } from '../../../utils/members.utils';
import { VerifyEmailModal } from '../../../components/layout/navbar/login-menu/verify-email-modal';
import {
  getMembersListOptions,
  getMembersOptionsFromQuery,
} from '../../../utils/members.utils';
import { ReactComponent as SuccessIcon } from '../../../public/assets/images/icons/success.svg';
import 'react-toastify/dist/ReactToastify.css';
import Cookies from 'js-cookie';
import { destroyCookie } from 'nookies';
import nookies from 'nookies'

type MembersProps = {
  members: IMember[];
  filtersValues: IMembersFiltersValues;
  isUserLoggedIn: boolean;
  userInfo: any,
  verified: boolean;
};

export default function Members({
  members,
  filtersValues,
  verified,
  userInfo
}: MembersProps) {
  const [isOpen, setIsModalOpen] = useState(false);
  const { selectedViewType } = useViewType();
  const router = useRouter();
  const isGrid = selectedViewType === 'grid';
  const filterProperties = [
    'skills',
    'region',
    'country',
    'metroArea',
    'officeHoursOnly',
    'includeFriends',
  ];

  useDirectoryFiltersFathomLogger('members', filterProperties);

  useEffect(() => {
   const isVerified = Cookies.get('verified');
   const error = Cookies.get('error');
   if(isVerified === 'true') {
      toast.success('Your account has been verified', {
        position: 'top-right',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: 'dark',
        icon: <SuccessIcon />
      });
   } else if (isVerified === 'false') {
      setIsModalOpen(true);
   }
   if (error === "true") {
      toast.error('Sign in attempt failed. Please try again later.', {
        position: 'top-right',
        autoClose: 5000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: 'dark',
      });
   }
   Cookies.remove('error');
   Cookies.remove('verified');
  }, [])

  return (
    <>
      <NextSeo {...DIRECTORY_SEO} title="Members" />
      <LoadingOverlay
        excludeUrlFn={(url) => url.startsWith('/directory/members/')}
      />

      <section className="pl-sidebar flex">
        <div className="w-sidebar fixed left-0 z-40 h-full flex-shrink-0 border-r border-r-slate-200 bg-white">
          <MembersDirectoryFilters
            filtersValues={filtersValues}
            filterProperties={filterProperties}
          />
        </div>

        <div className="mx-auto p-8">
          <div className="w-[917px] space-y-10">
            <DirectoryHeader
              title="Members"
              directoryType="members"
              searchPlaceholder="Search for a member"
              count={members.length}
            />

            <MembersDirectoryList
              members={members}
              isGrid={isGrid}
              filterProperties={filterProperties}
              loggedInMember={userInfo}
            />
          </div>
        </div>
      </section>
      <VerifyEmailModal
        isOpen={isOpen}
        setIsModalOpen={(isOpen) => {
          setIsModalOpen(isOpen);
          router.push('/directory/members/');
        }}
      />
      <ToastContainer
        bodyClassName="text-sm"
        className="!top-20"
        toastClassName="!rounded-md !bg-[#1E293B]"
        progressClassName="!bg-[#30C593]"
      />
    </>
  );
}

Members.getLayout = function getLayout(page: ReactElement) {
  return <DirectoryLayout>{page}</DirectoryLayout>;
};

export const getServerSideProps: GetServerSideProps<MembersProps> = async (ctx) => {
  const {
    query,
    res,
    req
  } = ctx;
  const testcookies = nookies.get(ctx)
  destroyCookie(null, 'state');
  const { verified } = query;
  const isMaskingRequired = req?.cookies?.authToken ? false : true
  const userInfo = req?.cookies?.userInfo ? JSON.parse(req?.cookies?.userInfo) : {};
  const isUserLoggedIn = req?.cookies?.authToken &&  req?.cookies?.userInfo ? true : false
  const optionsFromQuery = getMembersOptionsFromQuery(query);
  const listOptions = getMembersListOptions(optionsFromQuery);
  const [membersResponse, filtersValues] = await Promise.all([
    getMembers(listOptions),
    getMembersFilters(optionsFromQuery),
  ]);

  let members: IMember[] =
    membersResponse.status === 200
      ? membersResponse.body.map((member) => parseMember(member))
      : [];
  const parsedFilters: IMembersFiltersValues = parseMembersFilters(
    filtersValues,
    query
  );

  if(isMaskingRequired) {
     members = [...members].map(m => maskMemberDetails(m))
  }

  const letAllCookies = JSON.parse(JSON.stringify(testcookies))
  const testCookies = JSON.parse(JSON.stringify(req?.cookies))

  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  res.setHeader(
    'Cache-Control',
    'no-cache, no-store, max-age=0, must-revalidate'
  );

  return {
    props: {
      members,
      filtersValues: parsedFilters,
      isUserLoggedIn,
      testCookies,
      userInfo,
      letAllCookies,
      verified:
        verified === 'true' ? true : verified === 'false' ? false : null,
    },
  };
};
