/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import { LoadingOverlay } from 'apps/web-app/components/layout/loading-overlay/loading-overlay';
import ProjectsFilter from 'apps/web-app/components/projects/project-filters';
import { ProjectList } from 'apps/web-app/components/projects/project-list';
import { DirectoryHeader } from 'apps/web-app/components/shared/directory/directory-header/directory-header';
import { useViewType } from 'apps/web-app/components/shared/directory/directory-view/use-directory-view-type.hook';
import {
    ADMIN_ROLE,
    URL_QUERY_VALUE_SEPARATOR
} from 'apps/web-app/constants';
import { ProjectContextProvider } from 'apps/web-app/context/projects/project.context';
import { DirectoryLayout } from 'apps/web-app/layouts/directory-layout';
import { DIRECTORY_SEO } from 'apps/web-app/seo.config';
import ProjectsDataService from 'apps/web-app/services/projects/projects.data.service';
import { stringifyQueryValues } from 'apps/web-app/utils/list.utils';
import {
    convertCookiesToJson,
    renewAndStoreNewAccessToken,
} from 'apps/web-app/utils/services/auth';
import { getFocusAreas } from 'apps/web-app/utils/services/focusarea';
import { GetServerSideProps } from 'next';
import { NextSeo } from 'next-seo';
import { destroyCookie } from 'nookies';
import { ReactElement } from 'react';
import { getAllProjects } from '../../../../libs/projects/data-access/src/index';

export default function Projects(props) {
  const { selectedViewType } = useViewType();
  const isGrid = selectedViewType === 'grid';
  const parsedFilters = props?.parsedFilters ?? [];
  const filterProperties = ['FUNDING', 'TEAM', 'focusAreas'];
  return (
    <>
      <NextSeo {...DIRECTORY_SEO} title="Projects" />
      <LoadingOverlay excludeUrlFn={(url) => url.startsWith('/projects/')} />
      <div>
        <ProjectContextProvider>
          <section className="pl-sidebar flex pt-20">
            <div className="fixed left-0 z-40 h-full w-[300px] flex-shrink-0 border-r border-r-slate-200 bg-white">
              <ProjectsFilter
                parsedFilters={parsedFilters}
                filterProperties={filterProperties}
                isUserLoggedIn={props.isUserLoggedIn}
              />
            </div>
            <div className="mx-auto p-8">
              <div className="w-[917px] space-y-10">
                <DirectoryHeader
                  title="Projects"
                  directoryType="projects"
                  searchPlaceholder="Search for a Project"
                  count={props?.projects?.length}
                />
                <ProjectList
                  projects={props.projects}
                  isGrid={isGrid}
                  filterProperties={filterProperties}
                  isUserLoggedIn={props.isUserLoggedIn}
                />
              </div>
            </div>
          </section>
        </ProjectContextProvider>
      </div>
    </>
  );
}

Projects.getLayout = function getLayout(page: ReactElement) {
  return <DirectoryLayout>{page}</DirectoryLayout>;
};

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { query, res, req } = ctx;
  let cookies = req?.cookies;

  const queryParams = {
    orderBy: 'score,name',
    pagination: false,
  };

  let projects = null;
  let isUserLoggedIn = false;
  const userInfo = cookies?.userInfo ? JSON.parse(cookies?.userInfo) : {};
  const parsedFilters = {
    focusAreas: {
      rawData: [],
      selectedItems: [],
    },
  };

  try {
    if (query) {
      if (query?.FUNDING) {
        queryParams['lookingForFunding'] = query?.FUNDING === 'true';
      }
      if (query?.TEAM) {
        queryParams['team'] = query?.TEAM;
        queryParams['maintainingTeamUid'] = query?.TEAM;
      }
      if (query?.sort && query.sort === 'Name,desc') {
        queryParams['orderBy'] = '-name';
      }
      if (query?.sort && query.sort === 'Name,asc') {
        queryParams['orderBy'] = 'name';
      }
      if (query?.searchBy) {
        queryParams['name'] = query?.searchBy;
        queryParams['name__icontains'] = query?.searchBy;
      }
      if (query?.focusAreas) {
        queryParams['focusAreas'] = stringifyQueryValues(query.focusAreas);
      }
    }

    if (!cookies?.authToken) {
      await renewAndStoreNewAccessToken(cookies?.refreshToken, ctx);
      if (ctx.res.getHeader('Set-Cookie'))
        cookies = convertCookiesToJson(ctx.res.getHeader('Set-Cookie'));
    }
    destroyCookie(null, 'state');
    isUserLoggedIn = cookies?.authToken && cookies?.userInfo ? true : false;

    const [allProjects, focusAreasResponse] = await Promise.all([
      getAllProjects(queryParams),
      getFocusAreas("Project", queryParams),
    ]);
    if (allProjects.status === 200 && focusAreasResponse.status === 200) {
      const isAdmin =
        userInfo?.roles &&
        userInfo?.roles.length &&
        userInfo?.roles.includes(ADMIN_ROLE);
      projects = ProjectsDataService.getAllFormattedProjects(
        allProjects.body,
        isAdmin
      );

      const focusAreasRawData = focusAreasResponse.data
        ? focusAreasResponse.data
        : [];
      parsedFilters.focusAreas.rawData = focusAreasRawData;
      const focusareasFromQuery = Array.isArray(query.focusAreas)
        ? query.focusAreas
        : query?.focusAreas?.split(URL_QUERY_VALUE_SEPARATOR) || [];
      const selectedFocusAreas = focusAreasRawData.filter((focusArea) =>
        focusareasFromQuery.includes(focusArea?.title)
      );
      parsedFilters.focusAreas.selectedItems = selectedFocusAreas ?? [];
    }
  } catch (error) {
    console.error(error);
  }
  return {
    props: {
      projects,
      parsedFilters,
      isUserLoggedIn,
      userInfo,
    },
  };
};
