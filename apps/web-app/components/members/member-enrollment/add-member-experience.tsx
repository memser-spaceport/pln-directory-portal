import { Dropdown, Switch, SingleSelect } from "@protocol-labs-network/ui";
import { useEffect, useState } from "react";
import AddMemberExperienceForm from "./add-member-experience-form";
import { LoadingIndicator } from "../../shared/loading-indicator/loading-indicator";

function AddMemberExperience(props) {
    const errors = props.experienceErrors ?? [];
    const formValues = props.formValues;
    const experiences = formValues.experiences;
    const currentCompaniesCount = experiences.filter(v => v.currentTeam === true).length;
    const onChange = props.onChange;
   // const [experiences, setExperiences] = useState([]);
    const [expandedId, setExpandedId] = useState(-1);
    const [isLoading, setLoaderStatus] = useState(false)
    const defaultValues = {
        companyName: "",
        logoUrl: "",
        logoUid: 0,
        currentTeam: false,
        title: "",
        description: "",
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

    const onAddExperience = () => {
        const newExp = [...experiences];
        newExp.push(defaultValues);
        setExpandedId(newExp.length - 1)
        onChange({ target: { name: 'experiences', value: newExp } })
    }

    const onDeleteExperience = (index) => {
        if(index === expandedId) {
            setExpandedId(-1)
        }
        const newExp = [...experiences];
        newExp.splice(index, 1);
        console.log(index, newExp)
        onChange({ target: { name: 'experiences', value: newExp } });
    }

    const onItemChange = (index, key, value) => {
       const newExp =  [...experiences];
       newExp[index][key] = value;
       if(key === 'currentTeam' && value === false) {
          newExp[index].endDate = new Date(new Date().getFullYear() - 50, 0);
       } else if (key === 'currentTeam' && value === true) {
          newExp[index].endDate = null;
       }
       onChange({ target: { name: 'experiences', value: [...newExp] } })
    }

    useEffect(() => {
        console.log(formValues, errors)
    }, [formValues, errors])


    return <>
        <div className="">
            {experiences.length === 0 && <div className="w-full p-[8px] flex justify-center">
                <div className="border-dashed w-full border-[1px] mt-[20px] bg-[#F1F5F9] border-blue-600 p-[20px] flex flex-row items-center justify-center">
                    <p className="hidden">{`Total experiences ${experiences.length}`}</p>
                    <button onClick={onAddExperience} className="flex items-center justify-center">
                        <img src="/assets/images/icons/add-company-icon.svg" />
                        <span className="text-blue-600 font-[500] text-[13px]" >Click to add company</span>
                    </button>

                </div>
            </div>}
            <div className="mb-[32px]">
                {experiences.map((exp, expIndex) => <AddMemberExperienceForm currentCompaniesCount={currentCompaniesCount} errors={errors} setLoaderStatus={setLoaderStatus} onToggleExpansion={onToggleExpansion} expandedId={expandedId} key={`${expIndex}-exp`} onDeleteExperience={onDeleteExperience} exp={exp} expIndex={expIndex} onItemChange={onItemChange} />)}
            </div>
            {(experiences.length > 0 ) && <div className="flex justify-start">
                 {experiences.length <= 6 && <button onClick={onAddExperience} className="flex items-center justify-center text-[14px]">
                    <img className="" src="/assets/images/icons/expand-blue.svg" />
                    <span className="text-blue-600 mx-[4px]">Add Company</span>
                </button>}
                <p className="text-[14px] text-[#94A3B8]">(max 7 companies)</p>
            </div>}
            {isLoading && <div className="absolute flex items-center justify-center bg-black bg-opacity-40 top-0 left-0 right-0 w-full h-full z-[10]">
            <LoadingIndicator/>
            </div>}
        </div>

    </>
}

export default AddMemberExperience;