import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import ProjectsService from "apps/web-app/services/projects";
import { useRouter } from "next/router";
import { useContext } from "react";
import { toast } from "react-toastify";

export default function ProjectActionButtons() {
    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);
    const router = useRouter();

    const getNextTemplate = () => {
        return (
            <div className="px-[24px] py-[8px] rounded-[100px] border cursor-pointer border-[#156FF7] bg-[#156FF7] text-white"
                onClick={onNextClick}
            >
                Next
            </div>
        );
    }

    const getAddProjectTemplate = () => {
        return (
            <div className="px-[24px] py-[8px] rounded-[100px] border cursor-pointer border-[#156FF7] bg-[#156FF7] text-white"
                onClick={onSaveProject}
            >
                Add Project
            </div>
        );
    }

    const getCancelTemplate = () => {
        return (
            <div className="px-[24px] py-[8px] rounded-[100px] border border-[#156FF7]  text-[#156FF7] cursor-pointer"
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
            <div className="px-[24px] py-[8px] rounded-[100px] border border-[#156FF7]  text-[#156FF7] cursor-pointer"
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
                toast.error('Please review the fields with error(s)');
            }
        }else if (addProjectsState.currentStep === 1) {
            if (validateStep1()) {
                addProjectsDispatch({ type: 'SET_ERROR', payload: null });
                addProjectsDispatch({ type: 'SET_CURRENT_STEP', payload: addProjectsState.currentStep + 1 });
            }else {
                toast.error('Please review the fields with error(s)');
            }
        } else if (addProjectsState.currentStep === 2) {
            if (validateStep2()) {
                addProjectsDispatch({ type: 'SET_ERROR', payload: null });
                addProjectsDispatch({ type: 'SET_CURRENT_STEP', payload: addProjectsState.currentStep + 1 });
            } else {
                toast.error('Please review the fields with error(s)');
            }
        } else {
            addProjectsDispatch({ type: 'SET_CURRENT_STEP', payload: addProjectsState.currentStep + 1 });
        }
    }

    const onSaveProject = async () => {
        console.log(addProjectsState.inputs);
        let image = null;
        try {
            image = await ProjectsService.uploadProjectLogo(addProjectsState.inputs);
            const data = await ProjectsService.addProject(addProjectsState.inputs, image);
            console.log(data);
            
            if (data.status === 201) {
                toast.info("Project added successfully.")
                router.push('/projects');
            }
        } catch (err) {
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
            errors['name'] = 'Name is required';
        }
        if (!inputs.tagline) {
            errors['tagline'] = 'Tagline is required';
        }
        if (!inputs.desc) {
            errors['desc'] = 'Description is required';
        }

        inputs.projectURLs?.map((link, index) => {
            if (link.url && !link.text) {
                if (!errors['projectURLs']) {
                    errors['projectURLs'] = new Array(inputs.projectURLs.length).fill(null);
                }
                if (!errors['projectURLs'][index]) {
                    errors['projectURLs'][index] = {};
                }
                errors['projectURLs'][index]['text'] = 'Link text is required';
            }
            if (!link.url && link.text) {
                if (!errors['projectURLs']) {
                    errors['projectURLs'] = new Array(inputs.projectURLs.length).fill(null);
                }
                if (!errors['projectURLs'][index]) {
                    errors['projectURLs'][index] = {};
                }
                errors['projectURLs'][index]['url'] = 'Link url is required';
            }
            if (link.url && !link.url.match(urlRE)) {
                if (!errors['projectURLs']) {
                    errors['projectURLs'] = new Array(inputs.projectURLs.length).fill(null);
                }
                if (!errors['projectURLs'][index]) {
                    errors['projectURLs'][index] = {};
                }
                errors['projectURLs'][index]['url'] = 'Invalid Link.';
            }
        });

        if (inputs.contactEmail && !inputs.contactEmail.match(emailRE)) {
            errors['contactEmail'] = 'Invalid Email';
        }

        if (Object.keys(errors).length) {
            addProjectsDispatch({ type: 'SET_ERROR', payload: { ...errors } });
            return false;
        }

        return true;
    }

    const validateStep1 = () => {
        const errors = {};

        const inputs = addProjectsState.inputs;
        console.log(inputs);
        

        if(!inputs.maintainedBy){
            errors['maintainedBy'] = 'Please add maintainer team details';
        }else if (!inputs.maintainedByContributors || inputs.maintainedByContributors.length < 1) {
            errors['maintainedByContributors'] = 'Please add contributors to maintainer team';
        }

        if(inputs.collabTeamsList && inputs.collabTeamsList.length){
            inputs.collabTeamsList.map((cteam,index)=>{
                if(!cteam.members.length){
                    if(!errors['collabContributors']){
                        errors['collabContributors'] = [];
                    }
                    errors['collabContributors'][index] = 'Please add contributors to collaborating team';
                }
            });
        }

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
                errors['KPIs'][index]['value'] = 'KPI value is required';
            }
            if (!kpi.name && kpi.value) {
                if (!errors['KPIs']) {
                    errors['KPIs'] = new Array(inputs.KPIs.length).fill(null);
                }
                if (!errors['KPIs'][index]) {
                    errors['KPIs'][index] = {};
                }
                errors['KPIs'][index]['name'] = 'KPI name is required';
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
        <div className="flex flex-row-reverse gap-2 mb-12">
            {getActionButtons()}
        </div>
    );
}