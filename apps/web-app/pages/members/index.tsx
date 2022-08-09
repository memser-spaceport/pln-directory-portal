import airtableService from '@protocol-labs-network/airtable';
import { IMember } from '@protocol-labs-network/api';
import { GetServerSideProps } from 'next';
import { NextSeo } from 'next-seo';
import { DirectoryHeader } from '../../components/directory/directory-header/directory-header';
import { useViewType } from '../../components/directory/directory-view/use-directory-view-type.hook';
import { LoadingOverlay } from '../../components/layout/loading-overlay/loading-overlay';
import { MembersDirectoryFilters } from '../../components/members/members-directory/members-directory-filters/members-directory-filters';
import { IMembersFiltersValues } from '../../components/members/members-directory/members-directory-filters/members-directory-filters.types';
import { parseMembersFilters } from '../../components/members/members-directory/members-directory-filters/members-directory-filters.utils';
import { MembersDirectoryList } from '../../components/members/members-directory/members-directory-list/members-directory-list';
import {
  getMembersDirectoryListOptions,
  getMembersDirectoryRequestOptionsFromQuery,
} from '../../utils/api/list.utils';

type MembersProps = {
  members: IMember[];
  filtersValues: IMembersFiltersValues;
};

export default function Members({ members, filtersValues }: MembersProps) {
  const { selectedViewType } = useViewType();
  const isGrid = selectedViewType === 'grid';

  return (
    <>
      <NextSeo title="Members" />

      <LoadingOverlay excludeUrlFn={(url) => url.startsWith('/members/')} />

      <section className="pl-sidebar flex">
        <div className="w-sidebar fixed left-0 h-full flex-shrink-0 border-r border-r-slate-200 bg-white">
          <MembersDirectoryFilters filtersValues={filtersValues} />
        </div>

        <div className="mx-auto p-8">
          <div className="w-[917px] space-y-10">
            <DirectoryHeader
              title="Members"
              searchPlaceholder="Search for a member"
              count={members.length}
            />

            <MembersDirectoryList members={members} isGrid={isGrid} />
          </div>
        </div>
      </section>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<MembersProps> = async ({
  query,
  res,
}) => {
  const optionsFromQuery = getMembersDirectoryRequestOptionsFromQuery(query);
  const listOptions = getMembersDirectoryListOptions(optionsFromQuery);
  const [members, filtersValues] = await Promise.all([
    airtableService.getMembers(listOptions),
    airtableService.getMembersFiltersValues(optionsFromQuery),
  ]);
  const parsedFilters = parseMembersFilters(filtersValues, query);

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
