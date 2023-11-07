import { getProject } from "@protocol-labs-network/projects/data-access";
import { getTeams } from "@protocol-labs-network/teams/data-access";
import { Breadcrumb } from "@protocol-labs-network/ui";
import ContactInfos from "apps/web-app/components/projects/details/contact-infos";
import ContactAndLinks from "apps/web-app/components/projects/details/contactandlinks";
import Description from "apps/web-app/components/projects/details/description";
import Header from "apps/web-app/components/projects/details/header";
import KPIs from "apps/web-app/components/projects/details/kpis";
import AdditionalDetails from "apps/web-app/components/projects/details/readme";
import TeamsInvolved from "apps/web-app/components/projects/details/teams";
import { useProfileBreadcrumb } from "apps/web-app/hooks/profile/use-profile-breadcrumb.hook";
import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import ProjectsDataService from "apps/web-app/services/projects/projects.data.service";
import { convertCookiesToJson, renewAndStoreNewAccessToken } from "apps/web-app/utils/services/auth";
import { GetServerSideProps } from "next";
import { NextSeo } from "next-seo";
import { destroyCookie } from "nookies";
import { ReactElement } from "react";

export default function ProjectDetails({ selectedProject, userHasEditRights }) {
    const { breadcrumbItems } = useProfileBreadcrumb({
        backLink: '/directory/projects',
        directoryName: 'Projects',
        pageName: selectedProject.name,
    });
    return (
        <>
            <NextSeo {...DIRECTORY_SEO} title="ProjectDetails" />
            <Breadcrumb items={breadcrumbItems} classname="max-w-[150px] truncate" />
            <div className="flex pt-32 ">
                <div className="flex mx-auto gap-10">
                    <div className="w-[917px] mt-10  bg-white p-[30px] flex flex-col gap-[24px] rounded-[12px]">
                        <Header project={selectedProject} userHasEditRights={userHasEditRights} />
                        <Description content={selectedProject.description} />
                        <ContactAndLinks project={selectedProject} />
                        <KPIs project={selectedProject} />
                        <AdditionalDetails project={selectedProject} userHasEditRights={userHasEditRights} />
                    </div>
                    <div className="w-[291px] mt-10 flex flex-col gap-5">
                        <TeamsInvolved project={selectedProject}/>
                        <ContactInfos project={selectedProject}/>
                    </div>
                </div>
            </div>
        </>
    )
}

ProjectDetails.getLayout = function getLayout(page: ReactElement) {
    return <DirectoryLayout>{page}</DirectoryLayout>;
};

const checkForEditRights = async (userInfo, selectedProject) => {
    try {

        //case 1.validating if the user is ADMIN
        if (userInfo.roles && userInfo.roles.length && userInfo.roles.includes('DIRECTORYADMIN')) {
            return true;
        }

        //case 2. If the logged in user is the creator of the project.
        if (selectedProject.creator && userInfo.uid === selectedProject.creator.uid) {
            return true;
        }

        const getTeamsResponse = await getTeams({
            'teamMemberRoles.member.uid': userInfo.uid,
            select:
                'uid,name,logo.url,industryTags.title,teamMemberRoles.role,teamMemberRoles.mainTeam',
            pagination: false,
        })

        if (getTeamsResponse.status === 200 && getTeamsResponse.body && getTeamsResponse.body.length) {
            for (const team of getTeamsResponse.body) {
                //case 3.Validating if the user belongs to maintaining team 
                if (team.uid === selectedProject.teamUid) {
                    return true;
                }
                //case 4.Validating if the user belongs to one of the contributing teams 
                for (const cTeam of selectedProject.contributingTeams) {
                    if (cTeam.value === team.uid) {
                        return true;
                    }
                }
            }
        }
        return false;

    } catch (err) {
        console.log(err);
    }
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
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
    destroyCookie(null, 'state');
    const userInfo = cookies?.userInfo ? JSON.parse(cookies?.userInfo) : {};
    const isUserLoggedIn = cookies?.authToken && cookies?.userInfo ? true : false;

    const selectedProjectResponse = await getProject(query.id);
    let selectedProject = null;
    let userHasEditRights = false;
    // console.log(selectedProjectResponse);


    if (selectedProjectResponse.status === 200) {
        selectedProject = ProjectsDataService.getFormattedProject(selectedProjectResponse.body);
        userHasEditRights = await checkForEditRights(userInfo, selectedProject);

    } else if (selectedProjectResponse.status === 404) {
        return {
            notFound: true,
        }
    }

    return {
        props: {
            isUserLoggedIn,
            userInfo,
            selectedProject,
            userHasEditRights
        }
    };
}