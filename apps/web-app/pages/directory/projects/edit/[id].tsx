import { getProject } from "@protocol-labs-network/projects/data-access";
import { PAGE_ROUTES } from "apps/web-app/constants";
import ProjectsDataService from "apps/web-app/services/projects/projects.data.service";
import { convertCookiesToJson, renewAndStoreNewAccessToken } from "apps/web-app/utils/services/auth";
import { GetServerSideProps } from "next";
import { destroyCookie } from "nookies";
import { ReactElement } from "react";
import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { useProfileBreadcrumb } from "apps/web-app/hooks/profile/use-profile-breadcrumb.hook";
import { NextSeo } from "next-seo";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import { Breadcrumb } from "@protocol-labs-network/ui";
import AddForm from "apps/web-app/components/projects/add-form";
import { AddProjectContextProvider } from "apps/web-app/context/projects/add.context";
import ActionButtons from "apps/web-app/components/projects/action-buttons";

export default function EditProject({ selectedProject }) {
    const { breadcrumbItems } = useProfileBreadcrumb({
        backLink: '/directory/projects',
        directoryName: 'Projects',
        pageName: selectedProject.name,
    });
    return (
        <>
            <NextSeo {...DIRECTORY_SEO} title="ProjectDetailsEdit" />
            <Breadcrumb items={breadcrumbItems} classname="max-w-[150px] truncate" />
            <AddProjectContextProvider mode={'EDIT'} data={selectedProject}>
                <div className="flex pt-32 ">
                    <div className="mx-auto w-[916px] pt-10">
                        <div className="text-[30px] font-bold">
                            Edit Project
                        </div>
                        <AddForm mode={'EDIT'}/>
                        <ActionButtons/>
                    </div>
                </div>
            </AddProjectContextProvider>
        </>
    );
}

EditProject.getLayout = function getLayout(page: ReactElement) {
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

    const selectedProjectResponse = await getProject(query.id);
    let selectedProject = null;

    if (selectedProjectResponse.status === 200) {
        selectedProject = ProjectsDataService.getFormattedProject(selectedProjectResponse.body);
    } else if (selectedProjectResponse.status === 404) {
        return {
            notFound: true,
        }
    }

    return {
        props: {
            isUserLoggedIn,
            userInfo,
            selectedProject
        }
    };
}