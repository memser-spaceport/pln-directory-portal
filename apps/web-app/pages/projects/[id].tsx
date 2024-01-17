import { getMember, getMembers } from "@protocol-labs-network/members/data-access";
import { getProject } from "@protocol-labs-network/projects/data-access";
import { getTeams } from "@protocol-labs-network/teams/data-access";
import { Breadcrumb } from "@protocol-labs-network/ui";
import ContactInfos from "apps/web-app/components/projects/details/contact-infos";
import ContactAndLinks from "apps/web-app/components/projects/details/contactandlinks";
import Contributors from "apps/web-app/components/projects/details/contributors";
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

export default function ProjectDetails({ selectedProject, userHasEditRights, userHasDeleteRights, contributingMembers }) {
    const { breadcrumbItems } = useProfileBreadcrumb({
        backLink: '/projects',
        directoryName: 'Projects',
        pageName: selectedProject.name,
    });
    return (
        <>
            <NextSeo {...DIRECTORY_SEO} title="ProjectDetails" />
            <Breadcrumb items={breadcrumbItems} classname="max-w-[150px] truncate" />
            <div className="flex pt-32 pb-16">
                <div className="flex mx-auto gap-10">
                    <div className="w-[917px] flex flex-col gap-[24px] rounded-[12px]">
                        <div className=" mt-10 p-[30px] shadow-md flex flex-col gap-[24px] rounded-[12px] bg-white">
                            <Header project={selectedProject} userHasEditRights={userHasEditRights} userHasDeleteRights={userHasDeleteRights} />
                            <Description content={selectedProject.description} />
                        </div>
                        {
                            selectedProject.projectLinks?.length > 0
                            &&
                            <div className="p-[30px] shadow-md rounded-[12px] bg-white">
                                <ContactAndLinks project={selectedProject} />
                            </div>
                        }
                        {
                            selectedProject?.kpis.length > 0
                            &&
                            <div className="p-[30px] shadow-md rounded-[12px] bg-white">
                                <KPIs project={selectedProject} />
                            </div>
                        }

                        <div className="p-[30px] shadow-md rounded-[12px] bg-white">
                        <AdditionalDetails project={selectedProject} userHasEditRights={userHasEditRights} />
                        </div>
                    </div>
                    <div className="w-[291px] mt-10 flex flex-col gap-5">
                        <TeamsInvolved project={selectedProject}/>
                        <ContactInfos project={selectedProject}/>
                        {
                            (selectedProject?.contributors?.length>0 || contributingMembers?.length > 0) && 
                            <Contributors project={selectedProject} contributingMembers={contributingMembers}/>
                        }
                    </div>
                </div>
            </div>
        </>
    )
}

ProjectDetails.getLayout = function getLayout(page: ReactElement) {
    return <DirectoryLayout>{page}</DirectoryLayout>;
};

const checkForEditRights = async (userInfo, selectedProject, isUserLoggedIn) => {
    try {

        if(!isUserLoggedIn){
            return false;
        }

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
                if(selectedProject?.contributingTeams?.length){
                    for (const cTeam of selectedProject.contributingTeams) {
                        if (cTeam.value === team.uid) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;

    } catch (err) {
        console.log(err);
    }
}

const checkForDeleteRights = (userInfo,selectedProject,isUserLoggedIn) => {
    if (!isUserLoggedIn) {
        return false;
    }
    if (userInfo.roles && userInfo.roles.length && userInfo.roles.includes('DIRECTORYADMIN')){
    return true;
 }

 if(userInfo.leadingTeams?.length && userInfo.leadingTeams.includes(selectedProject.teamUid) ){
    return true;
 }
 return false;
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
    const getMembersResponse = await getMembers({
      'projectContributions.projectUid': query.id + '',
      select: 'uid,name,image,teamMemberRoles.team,teamMemberRoles.mainTeam,teamMemberRoles.role,teamMemberRoles.teamLead',
      pagination:false
    });
    
    let contributingMembers = null;
    if(getMembersResponse.status === 200){
        contributingMembers = getMembersResponse.body;
    }

    let selectedProject = null;
    let userHasEditRights = false;
    let userHasDeleteRights = false;

    // console.log(selectedProjectResponse.body['contributors']);

    if (selectedProjectResponse.status === 200) {
        selectedProject = ProjectsDataService.getFormattedProject(selectedProjectResponse.body);
        userHasEditRights = await checkForEditRights(userInfo, selectedProject, isUserLoggedIn);
        userHasDeleteRights = checkForDeleteRights(userInfo, selectedProject, isUserLoggedIn);
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
            userHasEditRights,
            userHasDeleteRights,
            contributingMembers
        }
    };
}