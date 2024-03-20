import Image from "next/image";
import { ReactComponent as EditIcon } from '/public/assets/images/icons/edit.svg';
import { useRouter } from "next/router";
import { ReactComponent as RemoveIcon } from '/public/assets/images/icons/projects/remove-kpi.svg';
import ProjectsService from "apps/web-app/services/projects";
import { toast } from "react-toastify";
import { DeleteConfirmationModal } from "./delete-confirmation";
import { useState } from "react";
import { APP_ANALYTICS_EVENTS } from "apps/web-app/constants";
import useAppAnalytics from "apps/web-app/hooks/shared/use-app-analytics";

export default function Header({ project, userHasEditRights, userHasDeleteRights }) {
    const router = useRouter();
    const [isOpen, setIsModalOpen] = useState(false);
    const analytics = useAppAnalytics();

    const delProject = () => {
        setIsModalOpen(true);
    }

    const onYes = async () => {
        try {
            const res = await ProjectsService.deleteProject(project.id);
            if (res.status === 200) {
                analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_DELETE_SUCCESS, {
                    projectId: project.id,
                });
                toast.success('Project deleted successfully.');
                setIsModalOpen(false);
                router.push('/directory/projects');
            }
        } catch (err) {
            analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_DELETE_FAILED, {
                projectId: project.id,
            });
            console.error(err);
            setIsModalOpen(false);
        }
    }

    return (
        <>
            <div className="flex justify-between">
                <div className="flex gap-[16px]">
                    <div>
                        <Image src={project?.isDeleted ? "/assets/images/icons/company-logo-default.svg" : project.image}alt="project image" width={100} height={108} className="rounded" />
                    </div>
                    <div className="flex flex-col gap-1 justify-center">
                        <div className="text-[24px] font-bold flex gap-2">
                            <div>{project.name}</div>
                            {
                                project?.fundingNeeded
                                &&
                                <div title="Raising Funds" className="relative top-1">
                                    <Image src={'/assets/images/icons/projects/funding-with-bg.svg'} alt="project image" width={24} height={24} />
                                </div>
                            }
                        </div>
                        <div className="text-[15px]">{project.tagline}</div>
                    </div>
                </div>
                {
                    !project.isDeleted
                    &&
                    <div className="flex gap-4">
                    {
                        userHasEditRights
                        &&
                        <div className="flex text-base font-semibold text-[#156FF7] cursor-pointer"
                            onClick={() => {
                                analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_EDIT_CLICKED, {
                                    projectId: project.id,
                                });
                                router.push('/projects/update/' + project.id)
                            }}
                        >
                            <EditIcon className="m-1" />{' '}
                            Edit
                        </div>
                    }
                    {
                        userHasDeleteRights
                        &&
                        <div className="flex text-base font-semibold text-[#DD2C5A] cursor-pointer gap-1"
                            onClick={() => {
                                analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_EDIT_CLICKED, {
                                    projectId: project.id,
                                });
                                delProject();
                            }}
                        >
                            <RemoveIcon className="" />{' '}
                            <div>Delete</div>
                        </div>
                    }
                </div>
                }
                <DeleteConfirmationModal isOpen={isOpen} setIsModalOpen={setIsModalOpen} onYes={onYes}/>
            </div>
        </>
    );
}