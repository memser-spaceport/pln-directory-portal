import airtableService from '@protocol-labs-network/airtable';
import {
  getMembers,
  TMemberListOptions,
} from '@protocol-labs-network/members/data-access';
import { GetServerSideProps } from 'next';
import { getServerSideSitemap, ISitemapField } from 'next-sitemap';
import { getMembersDirectoryRequestOptionsFromQuery } from '../../../utils/list.utils';
import { getSiteUrl } from '../../../utils/sitemap/sitemap.utils';

// eslint-disable-next-line @typescript-eslint/no-empty-function
export default function MembersSitemap() {}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const siteUrl = getSiteUrl(process.env.VERCEL_ENV, process.env.VERCEL_URL);
  let membersProfiles: ISitemapField[] = [];

  if (process.env.USE_CUSTOM_PLNETWORK_API) {
    const membersListOptions: TMemberListOptions = {
      select: 'uid',
      pagination: false,
    };
    const membersResponse = await getMembers(membersListOptions);

    if (membersResponse.status === 200) {
      membersProfiles = membersResponse.body.map((member) => ({
        loc: `${siteUrl}/directory/members/${member.uid}`,
        lastmod: new Date().toISOString(),
      }));
    }
  } else {
    const membersListOptions = getMembersDirectoryRequestOptionsFromQuery({
      includeFriends: 'true',
    });
    const members = await airtableService.getMembers(membersListOptions);

    membersProfiles = members.map((member) => ({
      loc: `${siteUrl}/directory/members/${member.id}`,
      lastmod: new Date().toISOString(),
    }));
  }

  return getServerSideSitemap(context, membersProfiles);
};
