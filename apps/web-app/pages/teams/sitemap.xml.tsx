import {
  getTeams,
  TTeamListOptions,
} from '@protocol-labs-network/teams/data-access';
import { GetServerSideProps } from 'next';
import { getServerSideSitemap, ISitemapField } from 'next-sitemap';
import { getSiteUrl } from '../../utils/sitemap/sitemap.utils';

// eslint-disable-next-line @typescript-eslint/no-empty-function
export default function TeamsSitemap() {}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const siteUrl = getSiteUrl(process.env.VERCEL_ENV, process.env.VERCEL_URL);
  let teamsProfiles: ISitemapField[] = [];

  const teamsListOptions: TTeamListOptions = {
    select: 'uid',
    pagination: false,
  };
  const teamsResponse = await getTeams(teamsListOptions);

  if (teamsResponse.status === 200) {
    teamsProfiles = teamsResponse.body.map((team) => ({
      loc: `${siteUrl}/teams/${team.uid}`,
      lastmod: new Date().toISOString(),
    }));
  }

  return getServerSideSitemap(context, teamsProfiles);
};
