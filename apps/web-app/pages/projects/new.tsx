import { Breadcrumb } from "@protocol-labs-network/ui";
import General from "apps/web-app/components/projects/steps/general";
import ProjectActionButtons from "apps/web-app/components/projects/steps/project-action-buttons";
import ProjectForms from "apps/web-app/components/projects/steps/steps-form";
import ProjectStepIndicator from "apps/web-app/components/projects/steps/steps-indicator";
import { AddProjectContextProvider, AddProjectsContext } from "apps/web-app/context/projects/add.context";
import { useProfileBreadcrumb } from "apps/web-app/hooks/profile/use-profile-breadcrumb.hook";
import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import { NextSeo } from "next-seo";
import { ReactElement, useContext, useState } from "react";

export default function NewProject() {
    const { breadcrumbItems } = useProfileBreadcrumb({
        backLink: '/projects',
        directoryName: 'Projects',
        pageName: 'Add',
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