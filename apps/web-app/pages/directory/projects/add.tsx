import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import { NextSeo } from "next-seo";
import { ReactElement } from "react";

export default function AddProject() {
    return <>
        <NextSeo {...DIRECTORY_SEO} title="AddProject" />
        <div>
            
        </div>
    </>
}

AddProject.getLayout = function getLayout(page: ReactElement) {
    return <DirectoryLayout>{page}</DirectoryLayout>;
};