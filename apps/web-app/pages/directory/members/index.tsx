import {
  getMembers,
  getMembersFilters,
} from '@protocol-labs-network/members/data-access';
import { GetServerSideProps } from 'next';
import { NextSeo } from 'next-seo';
import nookies, { destroyCookie } from 'nookies';
import { ReactElement } from 'react';
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
import { renewAndStoreNewAccessToken, convertCookiesToJson } from '../../../utils/services/auth';
import { parseMember, maskMemberDetails } from '../../../utils/members.utils';
import {
  getMembersListOptions,
  getMembersOptionsFromQuery,
} from '../../../utils/members.utils';

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
  const { selectedViewType } = useViewType();
  const isGrid = selectedViewType === 'grid';
  const filterProperties = [
    'skills',
    'region',
    'country',
    'metroArea',
    'officeHoursOnly',
    'includeFriends',
    'openToWork',
  ];

  useDirectoryFiltersFathomLogger('members', filterProperties);

  return (
    <>
      <NextSeo {...DIRECTORY_SEO} title="Members" />
      <LoadingOverlay
        excludeUrlFn={(url) => url.startsWith('/directory/members/')}
      />

      <section className="pl-sidebar flex pt-20">
        <div className="w-sidebar fixed left-0 z-40 h-full flex-shrink-0 border-r border-r-slate-200 bg-white">
          <MembersDirectoryFilters
            filtersValues={filtersValues}
            filterProperties={filterProperties}
            userInfo={userInfo}
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
  let cookies = req?.cookies;
  if (!cookies?.authToken) {
    await renewAndStoreNewAccessToken(cookies?.refreshToken, ctx);
    if (ctx.res.getHeader('Set-Cookie')) 
      cookies = convertCookiesToJson(ctx.res.getHeader('Set-Cookie'));
  }
  destroyCookie(null, 'state');
  const { verified } = query;
  const isMaskingRequired = cookies?.authToken ? false : true
  const userInfo = cookies?.userInfo ? JSON.parse(cookies?.userInfo) : {};
  const isUserLoggedIn = cookies?.authToken && cookies?.userInfo ? true : false;
  
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
      userInfo,
      verified:
        verified === 'true' ? true : verified === 'false' ? false : null,
    },
  };
};
