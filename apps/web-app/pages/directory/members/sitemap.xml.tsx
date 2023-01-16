import airtableService from '@protocol-labs-network/airtable';
import { GetServerSideProps } from 'next';
import { getServerSideSitemap, ISitemapField } from 'next-sitemap';
import { getMembersDirectoryRequestOptionsFromQuery } from '../../../utils/list.utils';
import { getSiteUrl } from '../../../utils/sitemap/sitemap.utils';

// eslint-disable-next-line @typescript-eslint/no-empty-function
export default function MembersSitemap() {}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const siteUrl = getSiteUrl(process.env.VERCEL_ENV, process.env.VERCEL_URL);
  const membersListOptions = getMembersDirectoryRequestOptionsFromQuery({
    includeFriends: 'true',
  });
  const members = await airtableService.getMembers(membersListOptions);

  const membersProfiles: ISitemapField[] = members.map((member) => ({
    loc: `${siteUrl}/directory/members/${member.id}`,
    lastmod: new Date().toISOString(),
  }));

  return getServerSideSitemap(context, membersProfiles);
};
