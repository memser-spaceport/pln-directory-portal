import { useEffect, useState } from "react";
import { LoadingIndicator } from "../../shared/loading-indicator/loading-indicator";
import ProjectContributionForm from "./project-contribution-form";

function ProjectContribution(props) {
    const errors = props.contributionErrors ?? [];
    const formValues = props.formValues;
    const contributions = formValues.projectContributions;
    const currentProjectsCount = contributions.filter(v => v.currentProject === true).length;
    const onChange = props.onChange;

    const [expandedId, setExpandedId] = useState(-1);
    const [isLoading, setLoaderStatus] = useState(false)

    const defaultValues = {
        projectUid: "",
        projectName: "",
        projectLogo: "",
        currentProject: false,
        description: "",
        role: "",
        startDate: new Date(new Date().getFullYear() - 50, 0),
        endDate: new Date(new Date().getFullYear() - 50, 1)
    }

    const onToggleExpansion = (index) => {
        setExpandedId(v => {
            if (v === index) {
                return -1
            } else {
                return index
            }
        })
    }

    const onAddContribution = () => {
        const newExp = [...contributions];
        newExp.push(defaultValues);
        setExpandedId(newExp.length - 1)
        onChange({ target: { name: 'projectContributions', value: newExp } })
    }

    const onDeleteContribution = (index) => {
        if(index === expandedId) {
            setExpandedId(-1)
        }
        const newExp = [...contributions];
        newExp.splice(index, 1);
        console.log(index, newExp)
        onChange({ target: { name: 'projectContributions', value: newExp } });
    }

    const onItemChange = (index, key, value) => {
       const newExp =  [...contributions];
       newExp[index][key] = value;
       if(key === 'currentProject' && value === false) {
          newExp[index].endDate = new Date(new Date().getFullYear() - 50, 0);
       } else if (key === 'currentProject' && value === true) {
          newExp[index].endDate = null;
       }
       onChange({ target: { name: 'projectContributions', value: [...newExp] } })
    }



    return <>
        <div className="">
            {contributions.length === 0 && <div className="w-full p-[8px] flex justify-center">
                <div className="border-dashed w-full border-[1px] mt-[20px] bg-[#F1F5F9] border-blue-600 p-[20px] flex flex-row items-center justify-center">
                    <p className="hidden">{`Total experiences ${contributions.length}`}</p>
                    <button onClick={onAddContribution} className="flex items-center justify-center">
                        <img src="/assets/images/icons/add-company-icon.svg" />
                        <span className="text-blue-600 font-[500] text-[13px]" >Click To Add Project Contributions</span>
                    </button>

                </div>
            </div>}
            <div className="mb-[32px]">
                {contributions.map((exp, expIndex) => <ProjectContributionForm currentProjectsCount={currentProjectsCount} errors={errors} setLoaderStatus={setLoaderStatus} onToggleExpansion={onToggleExpansion} expandedId={expandedId} key={`${expIndex}-exp`} onDeleteContribution={onDeleteContribution} exp={exp} expIndex={expIndex} onItemChange={onItemChange} />)}
            </div>
            {(contributions.length > 0 ) && <div className="flex justify-start">
                 {contributions.length <= 19 && <button onClick={onAddContribution} className="flex items-center justify-center text-[14px]">
                    <img className="" src="/assets/images/icons/expand-blue.svg" />
                    <span className="text-blue-600 mx-[4px]">Add Contribution</span>
                </button>}
                <p className="text-[14px] text-[#94A3B8]">(Max 20 contributions)</p>
            </div>}
            {isLoading && <div className="absolute flex items-center justify-center bg-black bg-opacity-40 top-0 left-0 right-0 w-full h-full z-[10]">
            <LoadingIndicator/>
            </div>}
        </div>

    </>
}

export default ProjectContribution;