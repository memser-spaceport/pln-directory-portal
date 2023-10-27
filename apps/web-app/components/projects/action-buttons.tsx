import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import { useRouter } from "next/router"
import { useContext } from "react";
import { toast } from "react-toastify";


export default function ActionButtons(){
    const urlRE = /(^|\s)((https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?)(?![.\S])/gi;
    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);
    const router = useRouter();

    const validateInputs = () => {
        const errors = {};

        const inputs = addProjectsState.inputs;

        if(!inputs.logoURL){
            errors['logoURL'] = 'Project Logo is required';
        }
        if(!inputs.name){
            errors['name'] = 'Project Name is required';
        }
        if(!inputs.tagline){
            errors['tagline'] = 'Project tagline is required';
        }
        if(!inputs.desc){
            errors['desc'] = 'Project description is required';
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

    const formatToSave = () => {
        const objectToSave = {
            logoURL: addProjectsState.logoURL,
            name: addProjectsState.name,
            tagline: addProjectsState.tagline,
            desc: addProjectsState.desc,
            projectURLs: addProjectsState.projectURLs,
            contactEmail: addProjectsState.contactEmail,
            fundsNeeded: addProjectsState.fundsNeeded,
            KPIs: addProjectsState.KPIs,
            readme: addProjectsState.readme
        }
        return objectToSave;
    }

    const onAddProject = () => {
        console.log(addProjectsState);
        if(validateInputs()){
            const data = formatToSave();
            console.log(data);
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
            <div className="flex flex-row-reverse gap-[8px] py-[20px] font-[15px] font-semibold">
                <div className="px-[24px] py-[8px] rounded-[100px] border cursor-pointer border-[#156FF7] bg-[#156FF7] text-white" 
                onClick={onAddProject}>
                    Add Project
                </div>
                <div className="px-[24px] py-[8px] rounded-[100px] border border-[#156FF7]  text-[#156FF7] cursor-pointer"
                onClick={()=>{
                    router.push('/directory/projects')
                }}>
                    Cancel
                </div>
            </div>
        </>
    )
}