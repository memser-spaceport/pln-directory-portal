import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import { NextSeo } from "next-seo";
import React, { ReactElement } from "react";
import ActionButtons from "apps/web-app/components/projects/action-buttons";
import { AddProjectContextProvider } from "apps/web-app/context/projects/add.context";
import AddForm from "apps/web-app/components/projects/add-form";

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