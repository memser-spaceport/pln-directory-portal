/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import ProjectsFilter from "apps/web-app/components/projects/project-filters";
import { ProjectList } from "apps/web-app/components/projects/project-list";
import { DirectoryHeader } from "apps/web-app/components/shared/directory/directory-header/directory-header";
import { useViewType } from "apps/web-app/components/shared/directory/directory-view/use-directory-view-type.hook";
import { ProjectContextProvider } from "apps/web-app/context/projects/project.context";
import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import ProjectsService from "apps/web-app/services/projects";
import { convertCookiesToJson, renewAndStoreNewAccessToken } from "apps/web-app/utils/services/auth";
import { GetServerSideProps } from "next";
import { NextSeo } from "next-seo";
import { destroyCookie } from "nookies";
import { ReactElement } from "react";
import { getAllProjects } from '../../../../../libs/projects/data-access/src/index';
import ProjectsDataService from "apps/web-app/services/projects/projects.data.service";

export default function Projects(props) {
    const { selectedViewType } = useViewType();
    const isGrid = selectedViewType === 'grid';
    const filterProperties = [
        'FUNDING',
        'TEAM'
    ];
    return (
        <>
            <NextSeo {...DIRECTORY_SEO} title="Projects" />
            <div>
                <ProjectContextProvider>
                    <section className="pl-sidebar flex pt-20">
                        <div className="w-[300px] fixed left-0 z-40 h-full flex-shrink-0 border-r border-r-slate-200 bg-white">
                            <ProjectsFilter filterProperties={filterProperties} />
                        </div>
                        <div className="mx-auto p-8">
                            <div className="w-[917px] space-y-10">
                                <DirectoryHeader
                                    title="Projects"
                                    directoryType="projects"
                                    searchPlaceholder="Search for a Project"
                                    count={props?.projects?.length}
                                />
                                <ProjectList projects={props.projects} isGrid={isGrid} filterProperties={filterProperties} />

                                {/* <TeamsDirectoryList
                                    teams={teams}
                                    isGrid={isGrid}
                                    filterProperties={filterProperties}
                                /> */}
                            </div>
                        </div>
                    </section>

                </ProjectContextProvider>
            </div>
        </>
    )
}

Projects.getLayout = function getLayout(page: ReactElement) {
    return <DirectoryLayout>{page}</DirectoryLayout>;
};

export const getServerSideProps: GetServerSideProps = async (ctx) => {
    const {
        query,
        res,
        req
    } = ctx;
    let cookies = req?.cookies;

    const queryParams = {
        orderBy:'name',
        pagination: false
    };
    if(query){
        if(query?.FUNDING){
            queryParams['lookingForFunding'] = query?.FUNDING === 'true';
        }
        if(query?.TEAM){
            queryParams['maintainingTeamUid'] = query?.TEAM;
        }
        if(query?.sort && query.sort === 'Name,desc'){
            queryParams['orderBy'] = '-name'
        }
        if(query?.searchBy){
            queryParams['name'] = query?.searchBy;
        }
    }
    
    if (!cookies?.authToken) {
        await renewAndStoreNewAccessToken(cookies?.refreshToken, ctx);
        if (ctx.res.getHeader('Set-Cookie'))
            cookies = convertCookiesToJson(ctx.res.getHeader('Set-Cookie'));
    }
    destroyCookie(null, 'state');
    const userInfo = cookies?.userInfo ? JSON.parse(cookies?.userInfo) : {};
    const isUserLoggedIn = cookies?.authToken && cookies?.userInfo ? true : false;

    // const { getAll } = ProjectsService;
    // const projects = await getAll(queryParams);
    let projects = null;
    
    const allProjects = await getAllProjects(queryParams);
    // const allProjects = await api.get('/v1/projects')
    if (allProjects.status === 200) {
        projects = ProjectsDataService.getAllFormattedProjects(allProjects.body);
    }
    return {
        props: {
            projects,
            isUserLoggedIn,
            userInfo,
        }
    };
}