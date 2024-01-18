import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import ProjectsService from "apps/web-app/services/projects";
import { useRouter } from "next/router";
import { useContext, useState } from "react";
import { toast } from "react-toastify";
import { LoadingIndicator } from "../../shared/loading-indicator/loading-indicator";

export default function ProjectActionButtons() {
    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const router = useRouter();

    const getNextTemplate = () => {
        return (
            <div className="px-[24px] py-[8px] rounded-[100px] border cursor-pointer border-[#156FF7] bg-[#156FF7] text-white shadow font-semibold"
                onClick={onNextClick}
            >
                Next
            </div>
        );
    }

    const getAddProjectTemplate = () => {
        return (
          <div
            className="cursor-pointer rounded-[100px] border border-[#156FF7] bg-[#156FF7] px-[24px] py-[8px] text-white shadow font-semibold"
            onClick={onSaveProject}
          >
            {addProjectsState?.mode === 'ADD' ? 'Add Project' : 'Save Changes'}
          </div>
        );
    }

    const getCancelTemplate = () => {
        return (
            <div className="px-[24px] py-[8px] rounded-[100px] border border-[#156FF7]  text-[#156FF7] cursor-pointer shadow font-semibold"
                onClick={() => {
                    if (addProjectsState.mode === 'ADD') {
                        router.push('/projects')
                    } else {
                        router.push('/projects/' + addProjectsState.inputs.id);
                    }
                }}>
                Cancel
            </div>
        );
    }

    const getBackTemplate = () => {
        return (
            <div className="px-[24px] py-[8px] rounded-[100px] border border-[#156FF7]  text-[#156FF7] cursor-pointer shadow font-semibold"
                onClick={() => {
                    addProjectsDispatch({ type: 'SET_CURRENT_STEP', payload: addProjectsState.currentStep - 1 });
                }}>
                Back
            </div>
        );
    }

    const onNextClick = () => {
        // addProjectsDispatch({ type: 'SET_ERROR', payload: null });
        if (addProjectsState.currentStep === 0) {
            if (validateStep0()) {
                addProjectsDispatch({ type: 'SET_ERROR', payload: null });
                addProjectsDispatch({ type: 'SET_CURRENT_STEP', payload: addProjectsState.currentStep + 1 });
            } else {
                toast.error('Please review the error field(s)');
            }
        }else if (addProjectsState.currentStep === 1) {
            if (validateStep1()) {
                addProjectsDispatch({ type: 'SET_ERROR', payload: null });
                addProjectsDispatch({ type: 'SET_CURRENT_STEP', payload: addProjectsState.currentStep + 1 });
            }else {
                toast.error('Please review the error field(s)');
            }
        } else if (addProjectsState.currentStep === 2) {
            if (validateStep2()) {
                addProjectsDispatch({ type: 'SET_ERROR', payload: null });
                addProjectsDispatch({ type: 'SET_CURRENT_STEP', payload: addProjectsState.currentStep + 1 });
            } else {
                toast.error('Please review the error field(s)');
            }
        } else {
            addProjectsDispatch({ type: 'SET_CURRENT_STEP', payload: addProjectsState.currentStep + 1 });
        }
    }

    const onSaveProject = async () => {
        let image = null;
        try {
            setIsProcessing(true);
            image = await ProjectsService.uploadProjectLogo(addProjectsState.inputs);
            if(addProjectsState.mode === 'ADD'){
                const data = await ProjectsService.addProject(addProjectsState.inputs, image);
                if (data.status === 201) {
                    router.push('/projects');
                    setIsProcessing(false);
                    toast.info("Project added successfully.")
                }
            }else{
                const data = await ProjectsService.updateProjectDetails(addProjectsState.inputs, image,addProjectsState.inputs.id);

                    if(data.status === 200){
                        // analytics.captureEvent(
                        //     APP_ANALYTICS_EVENTS.PROJECT_EDIT_SAVE_SUCESS,
                        //     {
                        //         'projectId': data.data.uid,
                        //     }
                        //   );
                        router.push('/projects/'+data.data.uid);
                        setIsProcessing(false);
                        toast.info("Project updated successfully.");
                    }
            }
        } catch (err) {
            setIsProcessing(false);
            console.log(err);
            // toast.error('Something went wrong.Please try again.')
        } 
    }

    const validateStep0 = () => {
        const urlRE = /(^|\s)((https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?)(?![.\S])/gi;
        const emailRE =
            /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        const errors = {};

        const inputs = addProjectsState.inputs;

        if (!inputs.name) {
            errors['name'] = 'Please enter a project name';
        }
        if (!inputs.tagline) {
            errors['tagline'] = "Please enter the project's tagline";
        }
        if (!inputs.desc) {
            errors['desc'] = 'Please enter a detailed description for the project';
        }

        inputs.projectURLs?.map((link, index) => {
            if (link.url && !link.text) {
                if (!errors['projectURLs']) {
                    errors['projectURLs'] = new Array(inputs.projectURLs.length).fill(null);
                }
                if (!errors['projectURLs'][index]) {
                    errors['projectURLs'][index] = {};
                }
                errors['projectURLs'][index]['text'] = 'Please enter the Project link text';
            }
            if (!link.url && link.text) {
                if (!errors['projectURLs']) {
                    errors['projectURLs'] = new Array(inputs.projectURLs.length).fill(null);
                }
                if (!errors['projectURLs'][index]) {
                    errors['projectURLs'][index] = {};
                }
                errors['projectURLs'][index]['url'] = 'Please enter the Project link';
            }
            if (link.url && !link.url.match(urlRE)) {
                if (!errors['projectURLs']) {
                    errors['projectURLs'] = new Array(inputs.projectURLs.length).fill(null);
                }
                if (!errors['projectURLs'][index]) {
                    errors['projectURLs'][index] = {};
                }
                errors['projectURLs'][index]['url'] = 'Please enter a valid Project link';
            }
        });

        if (inputs.contactEmail && !inputs.contactEmail.match(emailRE)) {
            errors['contactEmail'] = 'Please enter a valid email address';
        }

        if (Object.keys(errors).length) {
            addProjectsDispatch({ type: 'SET_ERROR', payload: { ...errors } });
            return false;
        }

        return true;
    }

    const checkMaintainedBycontributors = () => {
        const filtered = addProjectsState.inputs?.maintainedByContributors?.filter(contri=>{
            return !contri?.isDeleted
        });
        return filtered?.length > 0;
    }

    const checkCollaboratingcontributors = (members) => {
        const filtered = members?.filter(contri=>{
            return !contri?.isDeleted
        });
        return filtered?.length > 0;
    }

    const validateStep1 = () => {
        const errors = {};

        const inputs = addProjectsState.inputs;
        console.log(inputs);
        

        if(!inputs.maintainedBy){
            errors['maintainedBy'] = 'Please add maintainer team details';
        }
        // else if (!inputs.maintainedByContributors || inputs.maintainedByContributors.length < 1 || !checkMaintainedBycontributors()) {
        //     errors['maintainedByContributors'] = 'Please add contributors to maintainer team';
        // }

        // if(inputs.collabTeamsList && inputs.collabTeamsList.length){
        //     inputs.collabTeamsList.map((cteam,index)=>{
        //         if(!cteam.members.length || !checkCollaboratingcontributors(cteam?.members)){
        //             if(!errors['collabContributors']){
        //                 errors['collabContributors'] = [];
        //             }
        //             errors['collabContributors'][index] = 'Please add contributors to collaborating team';
        //         }
        //     });
        // }

        if (Object.keys(errors).length) {
            addProjectsDispatch({ type: 'SET_ERROR', payload: { ...errors } });
            return false;
        }
        return true;
    }

    const validateStep2 = () => {
        const errors = {};

        const inputs = addProjectsState.inputs;

        inputs.KPIs?.map((kpi, index) => {
            if (kpi.name && !kpi.value) {
                if (!errors['KPIs']) {
                    errors['KPIs'] = new Array(inputs.KPIs.length).fill(null);
                }
                if (!errors['KPIs'][index]) {
                    errors['KPIs'][index] = {};
                }
                errors['KPIs'][index]['value'] = 'Please enter KPI value';
            }
            if (!kpi.name && kpi.value) {
                if (!errors['KPIs']) {
                    errors['KPIs'] = new Array(inputs.KPIs.length).fill(null);
                }
                if (!errors['KPIs'][index]) {
                    errors['KPIs'][index] = {};
                }
                errors['KPIs'][index]['name'] = 'Please enter KPI name';
            }
        });

        if (Object.keys(errors).length) {
            addProjectsDispatch({ type: 'SET_ERROR', payload: { ...errors } });
            return false;
        }
        return true;
    }


    const getActionButtons = () => {
        switch (addProjectsState.currentStep) {
            case 0:
                return (
                    <>
                        {getNextTemplate()}
                        {getCancelTemplate()}
                    </>
                );
            case 1:
            case 2:
                return (
                    <>
                        {getNextTemplate()}
                        {getBackTemplate()}
                    </>
                );
            case 3:
                return (
                    <>
                        {getAddProjectTemplate()}
                        {getBackTemplate()}
                    </>
                );

        }
    }

    return (
      <>
        {isProcessing && (
          <div
            className={`fixed inset-0 z-[3000] flex h-screen w-screen items-center justify-center bg-gray-500 bg-opacity-75 outline-none transition-opacity`}
          >
            <LoadingIndicator />
          </div>
        )}
        <div className="mb-12 flex flex-row-reverse gap-2">
          {getActionButtons()}
        </div>
      </>
    );
}