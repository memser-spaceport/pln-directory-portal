import { MdEditor } from 'md-editor-rt';
import 'md-editor-rt/lib/style.css';
import { useEffect, useState } from "react";
import { MdPreview } from 'md-editor-rt';
import ProjectsService from 'apps/web-app/services/projects';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import { toast } from 'react-toastify';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';

export default function AdditionalDetails({ project, userHasEditRights }) {
    const initialReadme = project?.readMe;
    const [isTeamOftheProject, setTeamOftheProject] = useState(false);
    const { query } = useRouter();
    const [text, setText] = useState(project?.readMe);
    const [showEditor, setEditorVisible] = useState(false);
    const analytics = useAppAnalytics();
    // const { response } = useMdViewer(text);

    useEffect(() => {
        const userInfoFromCookie = Cookies.get('userInfo');
        if (userInfoFromCookie) {
            const parsedUserInfo = JSON.parse(userInfoFromCookie);
            if (parsedUserInfo?.leadingTeams?.length > 0 &&
                parsedUserInfo.leadingTeams.includes(project.teamUid)) {
                setTeamOftheProject(true);
            }
        }
    }, [])

    const onEditAction = () => {
        analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_EDIT_CLICKED, {
            projectId: project.id,
            from:'project-details'
        });
        setEditorVisible(true)
    }

    const onCancelAction = () => {
        analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_ADDITIONAL_DETAIL_EDIT_CANCELLED, {
            projectId: project.id,
        });
        setText(initialReadme);
        setEditorVisible(false)
    }

    const onSaveAction = async () => {
        analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_ADDITIONAL_DETAIL_EDIT_SAVE, {
            projectId: project.id,
        });
        try {
            project['readMe'] = text;
            const res = await ProjectsService.updateProject(query.id, project);
            if(res && res.status === 200){
                analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_ADDITIONAL_DETAIL_EDIT_SAVE_SUCCESS, {
                    projectId: project.id,
                });
                toast.success('Additional Details updated successfully.')
            }
            
        } catch (er) {
            analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_ADDITIONAL_DETAIL_EDIT_SAVE_FAILED, {
                projectId: project.id,
            });
            console.log(er);
            toast.error('Something went wrong.Please try again later.')
        }
        setEditorVisible(false)
    }
    return (
        <>
            <div className="flex justify-between">
                <div className="text-[14px] font-semibold text-[#64748B] tracking-[1px]">
                    Additional Details
                </div>
                {/* Enable edit button only when the corresponding team lead logsin and view */}
                {
                    !project.isDeleted && userHasEditRights && !showEditor && initialReadme && <div className="flex text-base font-semibold text-[#156FF7] cursor-pointer" onClick={onEditAction}>
                        Edit
                    </div>
                }
                {
                    showEditor && <div className='flex gap-[8px]'>
                        <div className="flex text-base font-semibold text-[#156FF7] cursor-pointer" onClick={onSaveAction}>
                            Save
                        </div>
                        <div className="flex text-base font-semibold text-[#156FF7] cursor-pointer" onClick={onCancelAction}>
                            Cancel
                        </div>
                    </div>
                }
            </div>
            {
                !showEditor && !initialReadme && <div className='border rounded-[12px] p-[16px] text-[12px] font-medium tracking-[0.12px]'>
                    No additional details added.
                    {
                        isTeamOftheProject
                        && <span>
                            <span className='text-[#156FF7] cursor-pointer'
                                onClick={onEditAction}> Click Here </span>
                            to add additional details (markdown supported).
                        </span>
                    }
                </div>
            }
            <div className='no-tailwind'>
                {/* <div dangerouslySetInnerHTML={{ __html: response }} /> */}
                {
                    !showEditor && initialReadme && <MdPreview modelValue={text} />
                }
            </div>
            {
                showEditor && <div>
                    <MdEditor modelValue={text} onChange={setText} language={'en-US'} toolbarsExclude={['catalog', 'github', 'save', 'htmlPreview']} />
                </div>
            }


        </>
    )
}