import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import { NextSeo } from "next-seo";
import React, { ReactElement } from "react";
import ActionButtons from "apps/web-app/components/projects/action-buttons";
import { AddProjectContextProvider } from "apps/web-app/context/projects/add.context";
import AddForm from "apps/web-app/components/projects/add-form";
import { convertCookiesToJson, renewAndStoreNewAccessToken } from "apps/web-app/utils/services/auth";
import { destroyCookie } from "nookies";
import { GetServerSideProps } from "next";
import { PAGE_ROUTES } from "apps/web-app/constants";

export default function AddProject() {

    return <>
        <NextSeo {...DIRECTORY_SEO} title="AddProject" />
        <AddProjectContextProvider>
            <div className="flex pt-20 ">
                <div className="mx-auto w-[656px] pt-10">
                    <div className="text-[30px] font-bold">
                        Add Project
                    </div>
                    <AddForm />
                    <div>
                        <ActionButtons />
                    </div>
                </div>
            </div>
        </AddProjectContextProvider>
    </>
}

AddProject.getLayout = function getLayout(page: ReactElement) {
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

    if (!isUserLoggedIn || !((userInfo?.roles?.length > 0 &&
        (userInfo.roles.includes('DIRECTORYADMIN')) ||
        userInfo?.leadingTeams?.length > 0))) {
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
        }
    };
}