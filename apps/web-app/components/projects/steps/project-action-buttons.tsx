import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import { useRouter } from "next/router";
import { useContext } from "react";

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
                onClick={onNextClick}
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
        addProjectsDispatch({ type: 'SET_ERROR', payload: null });
        if(addProjectsState.currentStep === 0){
            if(validateStep0()){
                addProjectsDispatch({ type: 'SET_CURRENT_STEP', payload: addProjectsState.currentStep + 1 });
            }
        }
    }

    const validateStep0 = () => {
        const urlRE = /(^|\s)((https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?)(?![.\S])/gi;
    const emailRE =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        const errors = {};

        const inputs = addProjectsState.inputs;

        if(!inputs.name){
            errors['name'] = 'Name is required';
        }
        if(!inputs.tagline){
            errors['tagline'] = 'Tagline is required';
        }
        if(!inputs.desc){
            errors['desc'] = 'Description is required';
        }
        
        inputs.projectURLs?.map((link,index)=>{
            if(link.url && !link.text){
                if(!errors['projectURLs']){
                    errors['projectURLs'] = new Array(inputs.projectURLs.length).fill(null);
                }
                if(!errors['projectURLs'][index]){
                    errors['projectURLs'][index] = {};
                }
                errors['projectURLs'][index]['text'] = 'Link text is required';
            }
            if(!link.url && link.text){
                if(!errors['projectURLs']){
                    errors['projectURLs'] = new Array(inputs.projectURLs.length).fill(null);
                }
                if(!errors['projectURLs'][index]){
                    errors['projectURLs'][index] = {};
                }
                errors['projectURLs'][index]['url'] = 'Link url is required';
            }
            if(link.url && !link.url.match(urlRE)){
                if(!errors['projectURLs']){
                    errors['projectURLs'] = new Array(inputs.projectURLs.length).fill(null);
                }
                if(!errors['projectURLs'][index]){
                    errors['projectURLs'][index] = {};
                }
                errors['projectURLs'][index]['url'] = 'Invalid Link.';
            }
        });

        if(inputs.contactEmail && !inputs.contactEmail.match(emailRE)){
            errors['contactEmail'] = 'Invalid Email';
        }

        if(Object.keys(errors).length){
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