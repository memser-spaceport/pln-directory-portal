import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import ProjectsService from "apps/web-app/services/projects";
import { useRouter } from "next/router"
import { useContext, useState } from "react";
import { toast } from "react-toastify";
import { LoadingIndicator } from "../shared/loading-indicator/loading-indicator";


export default function ActionButtons(){
    const urlRE = /(^|\s)((https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?)(?![.\S])/gi;
    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    // const { uploadProjectLogo, addProject } = ProjectsService;
    const router = useRouter();

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

        // if(!inputs.contactEmail){
        //     errors['contactEmail'] = 'Contact Email is required';
        // }

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

    const onAddProject = async () => {
        if(validateInputs()){
            let image = null;
            try{
                setIsProcessing(true);
                image = await ProjectsService.uploadProjectLogo(addProjectsState.inputs);
                const data = await ProjectsService.addProject(addProjectsState.inputs, image, router.query.teamUid);
                if(data.status === 201){
                    toast.info("Project added successfully.")
                    router.push('/directory/teams/'+data.data.teamUid);
                }
                
            }catch(err){
                console.log(err);
                toast.error('Something went wrong.Please try again.')
            }finally{
                setIsProcessing(false);
            }
            // console.log(data);
            //API call
        }else{
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
                onClick={onAddProject}>
                    Add Project
                </div>
                <div className="px-[24px] py-[8px] rounded-[100px] border border-[#156FF7]  text-[#156FF7] cursor-pointer"
                onClick={()=>{
                    router.push('/directory/teams/' + router.query.teamUid)
                }}>
                    Cancel
                </div>
            </div>
        </>
    )
}