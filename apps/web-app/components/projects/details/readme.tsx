import { MdEditor } from 'md-editor-rt';
import 'md-editor-rt/lib/style.css';
import { useEffect, useState } from "react";
import { MdPreview } from 'md-editor-rt';
import ProjectsService from 'apps/web-app/services/projects';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';

export default function AdditionalDetails({ project, userHasEditRights }) {
    const initialReadme = project?.readMe;
    const [isTeamOftheProject, setTeamOftheProject] = useState(false);
    const { query } = useRouter();
    const [text, setText] = useState(project?.readMe);
    const [showEditor, setEditorVisible] = useState(false);
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
        setEditorVisible(true)
    }

    const onCancelAction = () => {
        setText(initialReadme);
        setEditorVisible(false)
    }

    const onSaveAction = () => {
        try {
            project['readMe'] = text;
            ProjectsService.updateProject(query.id, project)
        } catch (er) {
            console.log(er);
        }
        setEditorVisible(false)
    }
    return (
        <>
            <div className="flex justify-between">
                <div className="text-[14px] font-medium text-[#64748B] tracking-[1px]">
                    Additional Details
                </div>
                {/* Enable edit button only when the corresponding team lead logsin and view */}
                {
                    userHasEditRights && !showEditor && initialReadme && <div className="px-[16px] py-[8px] text-white bg-[#156FF7] rounded border border-[#156FF7] cursor-pointer" onClick={onEditAction}>
                        Edit
                    </div>
                }
                {
                    showEditor && <div className='flex gap-[8px]'>
                        <div className="px-[16px] py-[8px] text-[#156FF7] rounded border border-[#156FF7] cursor-pointer" onClick={onCancelAction}>
                            Cancel
                        </div>
                        <div className="px-[16px] py-[8px] text-white bg-[#156FF7] rounded border border-[#156FF7] cursor-pointer" onClick={onSaveAction}>
                            Save
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