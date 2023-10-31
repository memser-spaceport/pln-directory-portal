import ContactAndLinks from "apps/web-app/components/projects/details/contactandlinks";
import Description from "apps/web-app/components/projects/details/description";
import Header from "apps/web-app/components/projects/details/header";
import KPIs from "apps/web-app/components/projects/details/kpis";
import AdditionalDetails from "apps/web-app/components/projects/details/readme";
import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import { convertCookiesToJson, renewAndStoreNewAccessToken } from "apps/web-app/utils/services/auth";
import { GetServerSideProps } from "next";
import { NextSeo } from "next-seo";
import { destroyCookie } from "nookies";
import { ReactElement } from "react";

export default function ProjectDetails() {
    return (
        <>
            <NextSeo {...DIRECTORY_SEO} title="ProjectDetails" />
            <div className="flex pt-20 ">
                <div className="mx-auto w-[917px] mt-10  bg-white p-[30px] flex flex-col gap-[24px] rounded-[12px]">
                    <Header/>
                    <Description content={"Connect Data is owned and run by a vibrant, open-source community of artists, fans, and api all around the world. Audius gives artists the power to share never-before-heard music and monetize streams directly. With the Audius API, developers can build their own apps on top of Connect Data, giving them access to one of the most unique audio catalogs in existence. Backed by an all-star Connect Data is owned and run by a vibrant, open-source community of artists, fans, and api all around the world. Audius gives artists the power to share never-before-heard music and monetize streams directly. With the Audius API, developers can build their own apps on top of Connect Data, giving them access to one of the most unique audio catalogs in existence. Backed by an all-star"}/>
                    <ContactAndLinks/>
                    <KPIs/>
                    <AdditionalDetails/>
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

    return {
        props: {
            isUserLoggedIn,
            userInfo,
        }
    };
}