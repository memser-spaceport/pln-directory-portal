import { SingleSelect, Switch } from "@protocol-labs-network/ui";
import { useRef } from "react";
import ProjectSelection from "./project-selection";

function ProjectContributionForm(props) {
    const currentProjectsCount = props.currentProjectsCount;
    const onItemChange = props.onItemChange;
    const exp = props.exp;
    const expIndex = props.expIndex;
    const errors = props?.errors.filter(err => err?.id === expIndex);
    const onDeleteContribution = props.onDeleteContribution;
    const expandedId = props.expandedId;
    const onToggleExpansion = props.onToggleExpansion;
    const uploadRef = useRef<HTMLInputElement>(null);
    const descriptionRef = useRef<HTMLTextAreaElement>(null);

    const getYears = () => {
        const currentYear = new Date().getFullYear();
        const start = currentYear - 50;
        const years = [];
        for (let year = start; year <= currentYear; year++) {
            years.push({ label: `${year}`, value: `${year}` });
        }
        return years;
    }

    const yearValues = getYears();
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const startMonthIndex = monthNames.indexOf(new Date(exp.startDate).toLocaleDateString(undefined, { month: 'long' }))
    const endMonthIndex = monthNames.indexOf(new Date(exp.endDate).toLocaleDateString(undefined, { month: 'long' }))
    const selectedStartYear = { label: `${new Date(exp.startDate).getFullYear()}`, value: `${new Date(exp.startDate).getFullYear()}` }
    const selectedEndyear = { label: `${new Date(exp.endDate).getFullYear()}`, value: `${new Date(exp.endDate).getFullYear()}` }

    const getMonths = () => {
        return [...monthNames].map(m => {
            return { label: m, value: m }
        })
    }

    const onMonthChange = (field, value) => {
        const monthIndex = monthNames.indexOf(value);
        const year = exp[field].getFullYear();
        const newDate = new Date(year, monthIndex);
        onItemChange(expIndex, field, newDate)
    }

    const onYearChange = (field, value) => {
        const month = exp[field].getMonth();
        const newDate = new Date(parseInt(value, 10), month);
        onItemChange(expIndex, field, newDate);
    }

    const onProjectSelected = (item) => {
        if(item && item.name) {
            onItemChange(expIndex, 'projectName', item.name);
        onItemChange(expIndex, 'projectLogo', item?.logo?.url)
        } else {
            onItemChange(expIndex, 'projectName', "");
            onItemChange(expIndex, 'projectLogo', "")
        }
    }

    return <>
        <div key={`${expIndex}-exp`} className="my-[8px]">
            <div className="w-full">
                {/* HEAD */}
                <div className={`rounded-[4px] ${errors.length === 0 ? 'bg-[#F1F5F9]' : 'bg-[#ef44441a]'} ${errors.length > 0 ? 'border-[1px] border-solid border-[#ED6E68]' : ''} h-[32px] flex items-center justify-between px-[8px]`}>
                    <div className="flex gap-[10px] mr-[16px]">
                        {expIndex === expandedId && <img className="cursor-pointer" onClick={() => onToggleExpansion(expIndex)} src="/assets/images/icons/arrow-down.svg" />}
                        {expIndex !== expandedId && <img className="cursor-pointer" onClick={() => onToggleExpansion(expIndex)} src="/assets/images/icons/arrow-up.svg" />}
                        <img onClick={() => onDeleteContribution(expIndex)} className="cursor-pointer" src="/assets/images/icons/delete-icon.svg" />
                    </div>
                    {exp.projectName.trim() === '' && <h2 className="text-[#0F172A] flex-1 font-[600] text-[14px]">{`Project ${expIndex + 1}`}</h2>}
                    {exp.projectName.trim() !== '' && <h2 className="text-[#0F172A] flex-1 font-[600] text-[14px]">{`${exp.projectName.trim()}`}</h2>}
                    <div className="flex flex-row items-center gap-[8px]">
                        <Switch nonEditable={exp.currentProject === false && currentProjectsCount === 3} initialValue={exp.currentTeam} onChange={(val) => onItemChange(expIndex, 'currentProject', val)} key={`${expIndex}-switch`} />
                        <label className="text-[12px] font-[600]">Current Project</label>
                    </div>
                </div>

                {expIndex === expandedId && <div className="flex flex-col">
                    {/* ERRORS */}
                    <ul className="mt-[8px] list-inside list-disc space-y-1">{errors.map((err, errIndex) => <li className="text-[#EF4444] text-[12px]" key={`err-${errIndex}`}>{err.error}</li>)}</ul>

                    {/*   LOGO & PROJECT NAME   */}
                   <div className="flex-1 flex flex-col my-[20px] gap-[12px]">
                            <div className="flex items-center justify-between">
                            <label className="text-[14px] font-[600]">Project Name*</label>
                            <button className="text-[12px] flex gap-[6px] items-center"><img className="w-[10px]" src="/assets/images/icons/expand-blue.svg"/><span className="text-blue-600">Add New Project</span></button>
                            </div>
                           {/*  <input maxLength={100} placeholder="Ex: Filecoin" className="text-[14px]  mt-[12px] border-solid border-[1px] border-[#CBD5E1] px-[12px] py-[8px] rounded-[8px] w-full" type="text" value={exp.companyName} onChange={(e) => onItemChange(expIndex, 'companyName', e.target.value)} /> */}
                            <ProjectSelection onProjectSelected={onProjectSelected}/>
                        </div>


                    {/*  ROLE  */}
                    <div className="my-[20px]">
                        <label className="text-[14px] font-[600]">Role*</label>
                        <input maxLength={100} placeholder="Ex: Senior Architect" className="text-[14px]  mt-[12px] border-solid border-[1px] border-[#CBD5E1] px-[12px] py-[8px] rounded-[8px] w-full" type="text" value={exp.role} onChange={(e) => onItemChange(expIndex, 'role', e.target.value)} />
                    </div>

                    {/*   DATES  */}
                    <div className="flex my-[20px] items-center justify-between">
                        <div className="flex flex-col w-[50%] pr-[8px]">
                            <h2 className="text-[14px] font-[600] mb-[8px]">From*</h2>
                            <div className="flex flex-row gap-[8px]">
                                <div className="w-[115px]"><SingleSelect onChange={(option) => onMonthChange('startDate', option.value)} initialOption={getMonths()[startMonthIndex]} placeholder="Select Month" options={getMonths()} /></div>
                                <div className="w-[75px]"><SingleSelect onChange={(option) => onYearChange('startDate', option.value)} initialOption={selectedStartYear} placeholder="Select Year" options={[...yearValues]} /></div>
                            </div>

                        </div>
                        <div className="w-[50%] pl-[8px]">
                            {exp?.endDate && <h2 className="text-[14px] font-[600] mb-[8px]">To*</h2>}
                            {!exp?.endDate && <h2 className="text-[14px] text-[#CBD5E1] font-[600] mb-[8px]">To</h2>}
                            {exp?.endDate && <div className="flex flex-row gap-[8px]">
                                <div className="w-[115px]"><SingleSelect onChange={(option) => onMonthChange('endDate', option.value)} initialOption={getMonths()[endMonthIndex]} placeholder="Select Month" options={getMonths()} /></div>
                                <div className="w-[75px]"><SingleSelect onChange={(option) => onYearChange('endDate', option.value)} initialOption={selectedEndyear} placeholder="Select Year" options={[...yearValues]} /></div>
                            </div>}
                            {!exp?.endDate && <div className="flex flex-row gap-[8px]">
                                <div className="w-[115px]"><input onClick={e => e.preventDefault()} className="w-full border-[1px] rounded-[8px] px-[8px] border-solid border-[#CBD5E1] h-[40px] text-[13px]" placeholder="Month" disabled /></div>
                                <div className="w-[75px]"><input onClick={e => e.preventDefault()} className="w-full border-[1px] rounded-[8px] px-[8px] border-solid border-[#CBD5E1] h-[40px] text-[13px]" placeholder="Year" disabled /></div>
                            </div>}
                        </div>
                    </div>

                    {/********************************   DESCRIPTION   ***********************************/}
                    <div className="mt-[20px]">
                        <label className="text-[14px] font-[600]">Description</label>
                        <textarea rows={5} maxLength={2000} ref={descriptionRef} placeholder="" className="text-[14px]  mt-[12px] border-solid border-[1px] border-[#CBD5E1] px-[12px] py-[8px] rounded-[8px] w-full" value={exp.description} onChange={(e) => onItemChange(expIndex, 'contribution', e.target.value)} />
                        {descriptionRef.current && <p className="text-[#475569] font-[500] text-[12px]">{`${descriptionRef?.current?.value?.length} of 2000 characters used`}</p>}
                    </div>
                </div>}
            </div>
        </div>
        <style jsx>
            {
                `


                `
            }
        </style>
    </>
}

export default ProjectContributionForm