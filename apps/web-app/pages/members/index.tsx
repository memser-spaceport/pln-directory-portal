import airtableService from '@protocol-labs-network/airtable';
import { IMember } from '@protocol-labs-network/api';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { DirectoryHeader } from '../../components/directory/directory-header/directory-header';
import { useViewType } from '../../components/directory/directory-view/use-directory-view-type.hook';
import { MembersDirectoryFilters } from '../../components/members/members-directory/members-directory-filters/members-directory-filters';
import { IMembersFiltersValues } from '../../components/members/members-directory/members-directory-filters/members-directory-filters.types';
import { parseMembersFilters } from '../../components/members/members-directory/members-directory-filters/members-directory-filters.utils';
import { MemberCard } from '../../components/shared/members/member-card/member-card';
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
      <Head>
        <title>Members</title>
      </Head>

      <section className="flex pl-[291px]">
        <div className="fixed left-0 w-[291px] flex-shrink-0 border-r border-r-slate-200 bg-white">
          <MembersDirectoryFilters filtersValues={filtersValues} />
        </div>

        <div className="mx-auto p-8">
          <div className="w-[917px] space-y-10">
            <DirectoryHeader
              title="Members"
              searchPlaceholder="Search for a member"
            />

            <div className="flex flex-wrap gap-4">
              {members.map((member) => (
                <MemberCard key={member.id} member={member} isGrid={isGrid} />
              ))}
            </div>

            <div className="text-sm text-slate-500">
              Showing <b>{members.length}</b> results
            </div>
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
