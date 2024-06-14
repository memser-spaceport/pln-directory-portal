import {
  getTeams,
  getTeamsFilters,
} from '@protocol-labs-network/teams/data-access';
import { GetServerSideProps } from 'next';
import { NextSeo } from 'next-seo';
import { ReactElement } from 'react';
import { LoadingOverlay } from '../../components/layout/loading-overlay/loading-overlay';
import { DirectoryHeader } from '../../components/shared/directory/directory-header/directory-header';
import { useViewType } from '../../components/shared/directory/directory-view/use-directory-view-type.hook';
import { TeamsDirectoryFilters } from '../../components/teams/teams-directory/teams-directory-filters/teams-directory-filters';
import { ITeamsFiltersValues } from '../../components/teams/teams-directory/teams-directory-filters/teams-directory-filters.types';
import { parseTeamsFilters } from '../../components/teams/teams-directory/teams-directory-filters/teams-directory-filters.utils';
import { TeamsDirectoryList } from '../../components/teams/teams-directory/teams-directory-list/teams-directory-list';
import { useDirectoryFiltersFathomLogger } from '../../hooks/plugins/use-directory-filters-fathom-logger.hook';
import { DirectoryLayout } from '../../layouts/directory-layout';
import { DIRECTORY_SEO } from '../../seo.config';
import { ITeam } from '../../utils/teams.types';
import { renewAndStoreNewAccessToken, convertCookiesToJson} from '../../utils/services/auth';
import {
  getTeamsFocusAreaOptionsFromQuery,
  getTeamsListOptions,
  getTeamsOptionsFromQuery,
  parseTeam,
} from '../../utils/teams.utils';
import { FILTER_API_ROUTES, URL_QUERY_VALUE_SEPARATOR } from 'apps/web-app/constants';
import api from 'apps/web-app/utils/api';


type TeamsProps = {
  teams: ITeam[];
  filtersValues: ITeamsFiltersValues;
  isUserLoggedIn: boolean;
  userInfo: any
};

export default function Teams({ teams, filtersValues }: TeamsProps) {
  const { selectedViewType } = useViewType();
  const isGrid = selectedViewType === 'grid';
  const filterProperties = [
    'tags',
    'membershipSources',
    'fundingStage',
    'technology',
    'includeFriends',
    'focusAreas',
    'officeHoursOnly'
  ];

  useDirectoryFiltersFathomLogger('teams', filterProperties);

  return (
    <>
      <NextSeo {...DIRECTORY_SEO} title="Teams" />

      <LoadingOverlay
        excludeUrlFn={(url) => url.startsWith('/teams/')}
      />

      <section className="pl-sidebar flex pt-20">
        <div className="w-sidebar fixed left-0 z-40 h-full flex-shrink-0 border-r border-r-slate-200 bg-white">
          <TeamsDirectoryFilters
            filtersValues={filtersValues}
            filterProperties={filterProperties}
          />
        </div>

        <div className="mx-auto p-8">
          <div className="w-[917px] space-y-10">
            <DirectoryHeader
              title="Teams"
              directoryType="teams"
              searchPlaceholder="Search for a team"
              count={teams.length}
            />

            <TeamsDirectoryList
              teams={teams}
              isGrid={isGrid}
              filterProperties={filterProperties}
            />
          </div>
        </div>
      </section>
    </>
  );
}

Teams.getLayout = function getLayout(page: ReactElement) {
  return <DirectoryLayout>{page}</DirectoryLayout>;
};

export const getServerSideProps: GetServerSideProps<TeamsProps> = async (ctx) => {
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
  const userInfo = cookies?.userInfo ? JSON.parse(cookies?.userInfo) : {};
  const isUserLoggedIn = cookies?.authToken &&  cookies?.userInfo ? true : false;
  const includeFriends = query?.includeFriends ?? 'false';
  const optionsFromQuery = getTeamsOptionsFromQuery(query);
  const listOptions = getTeamsListOptions(optionsFromQuery);
  const focusAreaFilterOptions = getTeamsFocusAreaOptionsFromQuery(query);
  const [teamsResponse, filtersValues, focusAreaResult] = await Promise.all([
    getTeams(listOptions),
    getTeamsFilters(optionsFromQuery, includeFriends.toString()),
    api.get(`${FILTER_API_ROUTES.FOCUS_AREA}?type=Team&plnFriend=${includeFriends}&${focusAreaFilterOptions?.join("&")}`),
  ]);

  const teams: ITeam[] =
    teamsResponse.status === 200
      ? teamsResponse.body.map((team) => parseTeam(team))
      : [];
  const parsedFilters: ITeamsFiltersValues = parseTeamsFilters(
    filtersValues,
    query
  );

  const focusAreaQuery = query?.focusAreas as string;
  const focusAreaFilters = focusAreaQuery?.split(URL_QUERY_VALUE_SEPARATOR);
  const focusAreas = {
    rawData: focusAreaResult.data,
    selectedFocusAreas: focusAreaFilters?.length>0 ? focusAreaResult.data?.filter(fa=> focusAreaFilters.includes(fa.title)) : []
  }
  parsedFilters.focusAreas = focusAreas;



  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  res.setHeader(
    'Cache-Control',
    'no-cache, no-store, max-age=0, must-revalidate'
  );

  return {
    props: {
      teams,
      filtersValues: parsedFilters,
      isUserLoggedIn,
      userInfo
    },
  };
};
