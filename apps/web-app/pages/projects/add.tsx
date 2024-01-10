import { Breadcrumb } from "@protocol-labs-network/ui";
import General from "apps/web-app/components/projects/steps/general";
import ProjectActionButtons from "apps/web-app/components/projects/steps/project-action-buttons";
import ProjectForms from "apps/web-app/components/projects/steps/steps-form";
import ProjectStepIndicator from "apps/web-app/components/projects/steps/steps-indicator";
import { PAGE_ROUTES } from "apps/web-app/constants";
import { AddProjectContextProvider, AddProjectsContext } from "apps/web-app/context/projects/add.context";
import { useProfileBreadcrumb } from "apps/web-app/hooks/profile/use-profile-breadcrumb.hook";
import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import { convertCookiesToJson, renewAndStoreNewAccessToken } from "apps/web-app/utils/services/auth";
import { GetServerSideProps } from "next";
import { NextSeo } from "next-seo";
import { destroyCookie } from "nookies";
import { ReactElement, useContext, useState } from "react";

export default function NewProject() {
    const { breadcrumbItems } = useProfileBreadcrumb({
        backLink: '/projects',
        directoryName: 'Projects',
        pageName: 'Add Project',
    });

    return (
        <>
            <NextSeo {...DIRECTORY_SEO} title="AddProject" />
            <Breadcrumb items={breadcrumbItems} classname="max-w-[150px] truncate" />
            <AddProjectContextProvider mode='ADD'>
                <div className="flex pt-32 ">
                    <div className="mx-auto w-[916px] pt-10 flex flex-col gap-[20px]">
                        <div className="text-[30px] font-bold">
                            Add Project
                        </div>
                        <ProjectStepIndicator />
                        <ProjectForms />
                        <ProjectActionButtons/>
                    </div>
                </div>
            </AddProjectContextProvider>
        </>
    );
}

NewProject.getLayout = function getLayout(page: ReactElement) {
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

    if (!isUserLoggedIn) {
        return {
            redirect: {
                permanent: false,
                destination: PAGE_ROUTES.PROJECTS,
            },
        };
    }
    return {
        props: {
            isUserLoggedIn,
            userInfo,
            // selectedProject
        }
    };
}