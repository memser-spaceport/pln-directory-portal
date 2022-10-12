import airtableService from '@protocol-labs-network/airtable';
import { GetServerSideProps } from 'next';
import { getServerSideSitemap, ISitemapField } from 'next-sitemap';
import { getTeamsDirectoryRequestOptionsFromQuery } from '../../../utils/api/list.utils';
import { getSiteUrl } from '../../../utils/sitemap/sitemap.utils';

// eslint-disable-next-line @typescript-eslint/no-empty-function
export default function TeamsSitemap() {}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const siteUrl = getSiteUrl(process.env.VERCEL_ENV, process.env.VERCEL_URL);
  const teamsListOptions = getTeamsDirectoryRequestOptionsFromQuery({
    includeFriends: 'true',
  });
  const teams = await airtableService.getTeams(teamsListOptions);

  const teamsProfiles: ISitemapField[] = teams.map((team) => ({
    loc: `${siteUrl}/directory/teams/${team.id}`,
    lastmod: new Date().toISOString(),
  }));

  return getServerSideSitemap(context, teamsProfiles);
};
