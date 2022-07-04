import airtableService from '@protocol-labs-network/airtable';
import { IMember } from '@protocol-labs-network/api';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { DirectorySearch } from '../../components/directory/directory-search/directory-search';
import { DirectorySort } from '../../components/directory/directory-sort/directory-sort';
import { DirectoryView } from '../../components/directory/directory-view/directory-view';
import { useViewType } from '../../components/directory/directory-view/use-directory-view-type.hook';
import { MemberCard } from '../../components/shared/members/member-card/member-card';
import { getMembersDirectoryRequestOptionsFromQuery } from '../../utils/api/list.utils';

type MembersProps = {
  members: IMember[];
};

export default function Members({ members }: MembersProps) {
  const { selectedViewType } = useViewType();
  const isGrid = selectedViewType === 'grid';

  return (
    <>
      <Head>
        <title>Members</title>
      </Head>

      <section className="flex">
        <div className="mx-auto p-8">
          <div className="w-[917px] flex-shrink-0">
            <div className="mb-10 flex items-center justify-between">
              <h1 className="text-3xl font-bold">Members</h1>
              <div className="flex items-center space-x-4">
                <DirectorySearch placeholder="Search for a member" />
                <span className="h-6 w-px bg-slate-300" />
                <DirectorySort />
                <DirectoryView />
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              {members.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  isClickable
                  isGrid={isGrid}
                  showLocation
                  showSkills
                  showTeams={false}
                />
              ))}
            </div>

            <div className="mt-8 text-sm text-slate-500">
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
  const options = getMembersDirectoryRequestOptionsFromQuery(query);
  const members = await airtableService.getMembers(options);

  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
  );

  return {
    props: { members },
  };
};
