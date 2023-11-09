import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import ProjectsService from "apps/web-app/services/projects";
import { useRouter } from "next/router"
import { useContext, useState } from "react";
import { toast } from "react-toastify";
import { LoadingIndicator } from "../shared/loading-indicator/loading-indicator";
import useAppAnalytics from "apps/web-app/hooks/shared/use-app-analytics";
import { APP_ANALYTICS_EVENTS } from "apps/web-app/constants";


export default function ActionButtons(){
    const urlRE = /(^|\s)((https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?)(?![.\S])/gi;
    const emailRE =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    // const { uploadProjectLogo, addProject } = ProjectsService;
    const router = useRouter();
    const analytics = useAppAnalytics();

    const mode = addProjectsState.mode;

    const validateInputs = () => {
        const errors = {};

        const inputs = addProjectsState.inputs;

        // if(!inputs.logoURL){
        //     errors['logoURL'] = 'Logo is required';
        // }
        if(!inputs.name){
            errors['name'] = 'Name is required';
        }
        if(!inputs.tagline){
            errors['tagline'] = 'Tagline is required';
        }
        if(!inputs.desc){
            errors['desc'] = 'Description is required';
        }
        if(!inputs.maintainedBy.value){
            errors['maintainedBy'] = 'Maintained By Team is required';
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

        if(!inputs.contactEmail){
            errors['contactEmail'] = 'Contact Email is required';
        }

        if(inputs.contactEmail && !inputs.contactEmail.match(emailRE)){
            errors['contactEmail'] = 'Invalid Email';
        }

        inputs.KPIs?.map((kpi,index)=>{
            if(kpi.name && !kpi.value){
                if(!errors['KPIs']){
                    errors['KPIs'] = new Array(inputs.KPIs.length).fill(null);
                }
                if(!errors['KPIs'][index]){
                    errors['KPIs'][index] = {};
                }
                errors['KPIs'][index]['value'] = 'KPI value is required';
            }
            if(!kpi.name && kpi.value){
                if(!errors['KPIs']){
                    errors['KPIs'] = new Array(inputs.KPIs.length).fill(null);
                }
                if(!errors['KPIs'][index]){
                    errors['KPIs'][index] = {};
                }
                errors['KPIs'][index]['name'] = 'KPI name is required';
            }
        });

        if(Object.keys(errors).length){
            addProjectsDispatch({ type: 'SET_ERROR', payload: { ...errors } });
            return false;
        }

        return true;
    }

    const onSaveProject = async () => {
        if(addProjectsState.mode === 'ADD'){
            analytics.captureEvent(
                APP_ANALYTICS_EVENTS.PROJECT_ADD_SAVE_CLICKED
              );
        }else{
            analytics.captureEvent(
                APP_ANALYTICS_EVENTS.PROJECT_EDIT_SAVE_CLICKED,
                {
                    'projectId': addProjectsState.inputs.id,
                }
              );
        }
        if(validateInputs()){
            if(addProjectsState.mode === 'ADD'){
                analytics.captureEvent(
                    APP_ANALYTICS_EVENTS.PROJECT_ADD_SAVE_VALIDATION_SUCCESS
                  );
            }else{
                analytics.captureEvent(
                    APP_ANALYTICS_EVENTS.PROJECT_EDIT_SAVE_VALIDATION_SUCCESS,
                    {
                        'projectId': addProjectsState.inputs.id,
                    }
                  );
            }
            let image = null;
            try{
                setIsProcessing(true);
                image = await ProjectsService.uploadProjectLogo(addProjectsState.inputs);
                if(addProjectsState.mode === 'ADD'){
                    const data = await ProjectsService.addProject(addProjectsState.inputs, image);
                    if(data.status === 201){
                        analytics.captureEvent(
                            APP_ANALYTICS_EVENTS.PROJECT_ADD_SAVE_SUCESS
                          );
                        toast.info("Project added successfully.")
                        router.push('/directory/projects');
                    }
                }else{
                    const data = await ProjectsService.updateProjectDetails(addProjectsState.inputs, image,addProjectsState.inputs.id);
                    
                    if(data.status === 200){
                        analytics.captureEvent(
                            APP_ANALYTICS_EVENTS.PROJECT_EDIT_SAVE_SUCESS,
                            {
                                'projectId': data.data.uid,
                            }
                          );
                        toast.info("Project upadated successfully.")
                        router.push('/directory/projects/'+data.data.uid);
                    }
                }
                
            }catch(err){
                console.log(err);
                if(addProjectsState.mode === 'ADD'){
                    analytics.captureEvent(
                        APP_ANALYTICS_EVENTS.PROJECT_ADD_SAVE_FAIL
                      );
                }else{
                    analytics.captureEvent(
                        APP_ANALYTICS_EVENTS.PROJECT_EDIT_SAVE_FAIL,
                        {
                            'projectId': addProjectsState.inputs.id,
                        }
                      );
                }
                // toast.error('Something went wrong.Please try again.')
            }finally{
                setIsProcessing(false);
            }
            // console.log(data);
            //API call
        } else {
            if (addProjectsState.mode === 'ADD') {
                analytics.captureEvent(
                    APP_ANALYTICS_EVENTS.PROJECT_ADD_SAVE_VALIDATION_FAILED
                );
            } else {
                analytics.captureEvent(
                    APP_ANALYTICS_EVENTS.PROJECT_EDIT_SAVE_VALIDATION_FAILED,
                    {
                        'projectId': addProjectsState.inputs.id,
                    }
                );
            }
            window.scrollTo({
                top: 0,
                behavior: "smooth",
            })
            toast.error('Validation failed');

        }
    }

    return (
        <>
            {isProcessing && (
                <div
                    className={`fixed inset-0 z-[3000] flex items-center justify-center bg-gray-500 bg-opacity-50`}
                >
                    <LoadingIndicator />
                </div>
            )}
            <div className="flex flex-row-reverse gap-[8px] py-[20px] font-[15px] font-semibold">
                <div className="px-[24px] py-[8px] rounded-[100px] border cursor-pointer border-[#156FF7] bg-[#156FF7] text-white" 
                onClick={onSaveProject}>
                    {
                        mode === 'ADD' ? 'Add Project' : 'Save Changes'
                    }
                </div>
                <div className="px-[24px] py-[8px] rounded-[100px] border border-[#156FF7]  text-[#156FF7] cursor-pointer"
                onClick={()=>{
                    if(addProjectsState.mode === 'ADD'){
                        analytics.captureEvent(
                            APP_ANALYTICS_EVENTS.PROJECT_ADD_CANCEL
                          );
                        router.push('/directory/projects')
                    }else{
                        analytics.captureEvent(
                            APP_ANALYTICS_EVENTS.PROJECT_EDIT_CANCEL,
                            {
                              'projectId': addProjectsState.inputs.id,
                            }
                          );
                        router.push('/directory/projects/'+addProjectsState.inputs.id);
                    }
                }}>
                    Cancel
                </div>
            </div>
        </>
    )
}