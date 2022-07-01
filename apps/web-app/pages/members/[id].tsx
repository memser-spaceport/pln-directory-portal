import airtableService from '@protocol-labs-network/airtable';
import { IMember } from '@protocol-labs-network/api';
import Head from 'next/head';
import { MemberProfileHeader } from '../../components/members/member-profile/member-profile-header';

interface MemberProps {
  member: IMember;
}

export default function Member({ member }: MemberProps) {
  return (
    <section className="mx-10 my-3">
      <Head>
        <title>Member {member.name}</title>
      </Head>
      <MemberProfileHeader member={member} />
    </section>
  );
}

export const getServerSideProps = async ({ query, res }) => {
  const { id } = query as { id: string };
  const member = await airtableService.getMember(id);

  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
  );

  return {
    props: { member },
  };
};
