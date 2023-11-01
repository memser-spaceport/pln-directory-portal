import { getProject } from "@protocol-labs-network/projects/data-access";
import ContactAndLinks from "apps/web-app/components/projects/details/contactandlinks";
import Description from "apps/web-app/components/projects/details/description";
import Header from "apps/web-app/components/projects/details/header";
import KPIs from "apps/web-app/components/projects/details/kpis";
import AdditionalDetails from "apps/web-app/components/projects/details/readme";
import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import ProjectsDataService from "apps/web-app/services/projects/projects.data.service";
import { convertCookiesToJson, renewAndStoreNewAccessToken } from "apps/web-app/utils/services/auth";
import { GetServerSideProps } from "next";
import { NextSeo } from "next-seo";
import { destroyCookie } from "nookies";
import { ReactElement } from "react";

export default function ProjectDetails({ selectedProject }) {
    return (
        <>
            <NextSeo {...DIRECTORY_SEO} title="ProjectDetails" />
            <div className="flex pt-20 ">
                <div className="mx-auto w-[917px] mt-10  bg-white p-[30px] flex flex-col gap-[24px] rounded-[12px]">
                    <Header project={selectedProject}/>
                    <Description content={selectedProject.description}/>
                    <ContactAndLinks project={selectedProject}/>
                    <KPIs project={selectedProject}/>
                    <AdditionalDetails project={selectedProject}/>
                </div>
            </div>
        </>
    )
}

ProjectDetails.getLayout = function getLayout(page: ReactElement) {
    return <DirectoryLayout>{page}</DirectoryLayout>;
};

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
    if(selectedProjectResponse.status === 200){
        selectedProject = ProjectsDataService.getFormattedProject(selectedProjectResponse.body);
    }

    return {
        props: {
            isUserLoggedIn,
            userInfo,
            selectedProject
        }
    };
}