import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import { NextSeo } from "next-seo";
import React, { ReactElement, useEffect } from "react";
import ActionButtons from "apps/web-app/components/projects/action-buttons";
import { AddProjectContextProvider } from "apps/web-app/context/projects/add.context";
import AddForm from "apps/web-app/components/projects/add-form";
import { authenticate, convertCookiesToJson, renewAndStoreNewAccessToken } from "apps/web-app/utils/services/auth";
import { destroyCookie } from "nookies";
import { GetServerSideProps } from "next";
import { PAGE_ROUTES } from "apps/web-app/constants";
import { Breadcrumb } from "@protocol-labs-network/ui";
import { useProfileBreadcrumb } from "apps/web-app/hooks/profile/use-profile-breadcrumb.hook";
import { useRouter } from "next/router";

export default function AddProject({isUserLoggedIn}) {

    const router = useRouter();

    useEffect(() => {
        if(!isUserLoggedIn){
            authenticate(router.asPath);
        }
    }, [])

    const { breadcrumbItems } = useProfileBreadcrumb({
        backLink:'/directory/projects',
        directoryName: 'Projects',
        pageName: 'Add',
      });

    return <>
        <NextSeo {...DIRECTORY_SEO} title="AddProject" />
        <Breadcrumb items={breadcrumbItems} classname="max-w-[150px] truncate"/>
        <AddProjectContextProvider mode='ADD'>
            <div className="flex pt-32 ">
                <div className="mx-auto w-[916px] pt-10">
                    <div className="text-[30px] font-bold">
                        Add Project
                    </div>
                    <AddForm mode={'ADD'}/>
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

    // if (!isUserLoggedIn 
    //     || !((userInfo?.roles?.length > 0 &&
    //     (userInfo.roles.includes('DIRECTORYADMIN')) ||
    //     (userInfo?.leadingTeams?.length > 0 && query.teamUid && userInfo?.leadingTeams.includes(query.teamUid))))
    //     ) {
    //     return {
    //         redirect: {
    //             permanent: false,
    //             destination: PAGE_ROUTES.PROJECTS,
    //         },
    //     };
    // }

    return {
        props: {
            isUserLoggedIn,
            userInfo,
        }
    };
}