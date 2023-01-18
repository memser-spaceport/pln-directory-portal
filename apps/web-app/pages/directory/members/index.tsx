import airtableService from '@protocol-labs-network/airtable';
import { IMember } from '@protocol-labs-network/api';
import {
  getMembers,
  getMembersFilters,
  parseMember,
} from '@protocol-labs-network/members/data-access';
import { GetServerSideProps } from 'next';
import { NextSeo } from 'next-seo';
import { ReactElement } from 'react';
import { DirectoryHeader } from '../../../components/directory/directory-header/directory-header';
import { useViewType } from '../../../components/directory/directory-view/use-directory-view-type.hook';
import { LoadingOverlay } from '../../../components/layout/loading-overlay/loading-overlay';
import { MembersDirectoryFilters } from '../../../components/members/members-directory/members-directory-filters/members-directory-filters';
import { IMembersFiltersValues } from '../../../components/members/members-directory/members-directory-filters/members-directory-filters.types';
import { parseMembersFilters } from '../../../components/members/members-directory/members-directory-filters/members-directory-filters.utils';
import { MembersDirectoryList } from '../../../components/members/members-directory/members-directory-list/members-directory-list';
import { useDirectoryFiltersFathomLogger } from '../../../hooks/plugins/use-directory-filters-fathom-logger.hook';
import { DirectoryLayout } from '../../../layouts/directory-layout';
import { DIRECTORY_SEO } from '../../../seo.config';
import {
  getMembersDirectoryListOptions,
  getMembersDirectoryRequestOptionsFromQuery,
} from '../../../utils/list.utils';
import {
  getMembersListOptions,
  getMembersOptionsFromQuery,
} from '../../../utils/members.utils';

type MembersProps = {
  members: IMember[];
  filtersValues: IMembersFiltersValues;
};

export default function Members({ members, filtersValues }: MembersProps) {
  const { selectedViewType } = useViewType();
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

export const getServerSideProps: GetServerSideProps<MembersProps> = async ({
  query,
  res,
}) => {
  let members: IMember[];
  let parsedFilters: IMembersFiltersValues;

  if (process.env.USE_CUSTOM_PLNETWORK_API) {
    const optionsFromQuery = getMembersOptionsFromQuery(query);
    const listOptions = getMembersListOptions(optionsFromQuery);
    const [membersResponse, filtersValues] = await Promise.all([
      getMembers(listOptions),
      getMembersFilters(optionsFromQuery),
    ]);

    members =
      membersResponse.status === 200
        ? membersResponse.body.map((member) => parseMember(member))
        : [];
    parsedFilters = parseMembersFilters(filtersValues, query);
  } else {
    const optionsFromQuery = getMembersDirectoryRequestOptionsFromQuery(query);
    const listOptions = getMembersDirectoryListOptions(optionsFromQuery);
    const [membersResponse, filtersValues] = await Promise.all([
      airtableService.getMembers(listOptions),
      airtableService.getMembersFiltersValues(optionsFromQuery),
    ]);

    members = membersResponse;
    parsedFilters = parseMembersFilters(filtersValues, query);
  }

  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
  );

  return {
    props: { members, filtersValues: parsedFilters },
  };
};
