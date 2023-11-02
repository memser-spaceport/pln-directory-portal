import { InputField, SingleSelect, Switch } from "@protocol-labs-network/ui";
import api from "apps/web-app/utils/api";
import { useRef, useState } from "react";

function AddMemberExperienceForm(props) {
    const currentCompaniesCount = props.currentCompaniesCount;
    const onItemChange = props.onItemChange;
    const exp = props.exp;
    const expIndex = props.expIndex;
    const errors = props?.errors.filter(err => err?.id === expIndex);
    const onDeleteExperience = props.onDeleteExperience;
    const expandedId = props.expandedId;
    const onToggleExpansion = props.onToggleExpansion;
    const setLoaderStatus = props.setLoaderStatus
    const uploadRef = useRef();
    const descriptionRef = useRef();
    const [isLogoHovered, setLogoHoverStatus] = useState(false);

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
    const startMonthIndex = monthNames.indexOf(exp.startDate.toLocaleDateString(undefined, { month: 'long' }))
    const endMonthIndex = monthNames.indexOf(exp.endDate?.toLocaleDateString(undefined, { month: 'long' }))
    const selectedStartYear = {label: `${exp.startDate.getFullYear()}`, value: `${exp.startDate.getFullYear()}`}
    const selectedEndyear = {label: `${exp.endDate?.getFullYear()}`, value: `${exp.endDate?.getFullYear()}`}

    const getMonths = () => {
        return [...monthNames].map(m => {
            return { label: m, value: m }
        })

    }

    const onMonthChange = (field, value ) => {
        const monthIndex = monthNames.indexOf(value);
        const year = exp[field].getFullYear();
        const newDate = new Date(year, monthIndex);
        onItemChange(expIndex, field, newDate)
    }

    const onYearChange = (field, value) => {
        const month = exp[field].getMonth();
        const newDate =  new Date(parseInt(value, 10), month);
        onItemChange(expIndex, field, newDate);
    }

    function bytesToSize(bytes: number) {
        return parseFloat((bytes / 1024 ** 2).toFixed(1));
      }

    const onHandleImageUpload = async (e) => {
        setLoaderStatus(true)
        const file = e.target.files?.[0];
        const isValidFormat = ['image/jpeg', 'image/png'].includes(file.type);
        const sizeInMB = bytesToSize(file.size);
        if(!isValidFormat) {

        }
        if(sizeInMB > 4) {
        }

        try {
            const formData = new FormData();
            formData.append('file', file);
            const config = {
              headers: {
                'content-type': 'multipart/form-data',
              },
            };

          console.log("calling api")
          const imageResponse = await api.post(`/v1/images`, formData, config);
          const result = imageResponse.data.image;
          onItemChange(expIndex, 'logoUid', result.uid);
          onItemChange(expIndex, 'logoUrl', result.url);
          console.log(result);
          setLoaderStatus(false)
        } catch (error) {
            console.log(error)
            setLoaderStatus(false)
        }

        setLoaderStatus(false)

    }

    const onImageUpload = () => {
        if(uploadRef?.current) {
            console.log('in current')
            uploadRef?.current?.click();
        }
    }

    const onImageDelete = () => {
        onItemChange(expIndex, 'logoUid', 0);
        onItemChange(expIndex, 'logoUrl', "");
    }

    return <>
        <div key={`${expIndex}-exp`} className="my-[8px]">
            <div className="w-full">

                {/********************************   HEAD   ***********************************/}
                <div className={`rounded-[4px] ${errors.length === 0 ? 'bg-[#F1F5F9]': 'bg-[#ef44441a]'} ${errors.length > 0 ? 'border-[1px] border-solid border-[#ED6E68]': ''} h-[32px] flex items-center justify-between px-[8px]`}>
                    <div className="flex gap-[10px] mr-[16px]">
                        {expIndex === expandedId && <img className="cursor-pointer" onClick={() => onToggleExpansion(expIndex)} src="/assets/images/icons/collapse-blue.svg" />}
                        {expIndex !== expandedId && <img className="cursor-pointer" onClick={() => onToggleExpansion(expIndex)} src="/assets/images/icons/expand-blue.svg" />}
                        <img onClick={() => onDeleteExperience(expIndex)} className="cursor-pointer" src="/assets/images/icons/delete-icon.svg" />
                    </div>
                    {exp.companyName.trim() === '' && <h2 className="text-[#0F172A] flex-1 font-[600] text-[14px]">{`Company ${expIndex + 1}`}</h2>}
                    {exp.companyName.trim() !== '' && <h2 className="text-[#0F172A] flex-1 font-[600] text-[14px]">{`${exp.companyName.trim()}`}</h2>}
                    <div className="flex flex-row items-center gap-[8px]">
                        <Switch nonEditable={exp.currentTeam === false && currentCompaniesCount === 3} initialValue={exp.currentTeam} onChange={(val) => onItemChange(expIndex, 'currentTeam', val)} key={`${expIndex}-switch`} />
                        <label className="text-[12px] font-[600]">Current Team</label>
                    </div>
                </div>

                {expIndex === expandedId && <div className="flex flex-col">
                     {/*********************************** ERRORS   ***************************************/}
                <ul className="mt-[8px] list-inside list-disc space-y-1">{errors.map((err, errIndex) => <li className="text-[#EF4444] text-[12px]" key={`err-${errIndex}`}>{err.error}</li>)}</ul>
                    {/********************************   LOGO & COMPANY NAME   ***********************************/}
                    <div className="flex items-center justify-start my-[20px] mb-[8px] gap-[20px]">
                        {!exp.logoUrl && <div  onClick={onImageUpload} className="flex rounded-[8px] cursor-pointer border-[#CBD5E1] bg-[#F1F5F9] border-solid border-[3px] h-[100px] w-[100px] flex-col items-center justify-center">
                            <img src="/assets/images/icons/add-image-icon.svg" />
                            <p className="color-[#156FF7] text-[12px] text-blue-600">Add Logo</p>
                            <input onChange={onHandleImageUpload} ref={uploadRef} type="file" hidden/>
                        </div>}
                        {exp.logoUrl && <div onMouseLeave={() => setLogoHoverStatus(false)} onMouseOver={() => setLogoHoverStatus(true)} onClick={onImageUpload} className="flex relative rounded-[8px] cursor-pointer border-[#CBD5E1] bg-[#F1F5F9] border-solid border-[3px] h-[100px] w-[100px] flex-col items-center justify-center">
                            <img src={exp.logoUrl}/>
                            {isLogoHovered && <div className="absolute rounded-[6px]  w-full h-full top-0 left-0 right-0 flex items-center justify-around bg-black bg-opacity-40">
                                <img className="cursor-pointer" onClick={onImageUpload} src="/assets/images/icons/recycle.svg"/>
                                <img className="cursor-pointer" onClick={onImageDelete} src="/assets/images/icons/trash_icon.svg"/>
                            </div>}
                        </div>}
                        <div className="flex-1">
                            <label className="text-[14px] font-[600]">Company Name*</label>
                            <input placeholder="Ex: Microsoft" className="text-[14px]  mt-[12px] border-solid border-[1px] border-[#CBD5E1] px-[12px] py-[8px] rounded-[8px] w-full" type="text" value={exp.companyName} onChange={(e) => onItemChange(expIndex, 'companyName', e.target.value)} />
                        </div>
                    </div>
                    <div className="mt-8px flex gap-[8px]">
                        <img src="/assets/images/icons/info_icon.svg" />
                        <p className="text-[12px]">Please upload a squared image in PNG or JPEG format only</p>

                    </div>

                    {/********************************   TITLE   ***********************************/}
                    <div className="my-[20px]">
                        <label className="text-[14px] font-[600]">Title*</label>
                        <input placeholder="Ex: Senior Architect" className="text-[14px]  mt-[12px] border-solid border-[1px] border-[#CBD5E1] px-[12px] py-[8px] rounded-[8px] w-full" type="text" value={exp.title} onChange={(e) => onItemChange(expIndex, 'title', e.target.value)} />
                    </div>




                    {/********************************   DATES   ***********************************/}
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col w-[50%] pr-[8px]">
                            <h2 className="text-[14px] font-[600] mb-[8px]">From*</h2>
                            <div className="flex flex-row gap-[8px]">
                                <div className="w-[115px]"><SingleSelect onChange={(option) => onMonthChange('startDate', option.value)} initialOption={getMonths()[startMonthIndex]} placeholder="Select Month" options={getMonths()} /></div>
                                <div className="w-[75px]"><SingleSelect onChange={(option) => onYearChange('startDate', option.value)} initialOption={selectedStartYear} placeholder="Select Year" options={[...yearValues]} /></div>
                            </div>

                        </div>
                        <div className="w-[50%] pl-[8px]">
                            {exp?.endDate && <h2 className="text-[14px] font-[600] mb-[8px]">To*</h2>}
                            {!exp?.endDate &&  <h2 className="text-[14px] text-[#CBD5E1] font-[600] mb-[8px]">To</h2>}
                            {exp?.endDate && <div className="flex flex-row gap-[8px]">
                                <div className="w-[115px]"><SingleSelect onChange={(option) => onMonthChange('endDate', option.value)} initialOption={getMonths()[endMonthIndex]} placeholder="Select Month" options={getMonths()} /></div>
                                <div className="w-[75px]"><SingleSelect onChange={(option) => onYearChange('endDate', option.value)} initialOption={selectedEndyear} placeholder="Select Year" options={[...yearValues]} /></div>
                            </div>}
                            {!exp?.endDate && <div className="flex flex-row gap-[8px]">
                                <div className="w-[115px]"><input onClick={e => e.preventDefault()} className="w-full border-[1px] rounded-[8px] px-[8px] border-solid border-[#CBD5E1] h-[40px] text-[13px]" placeholder="Month" disabled/></div>
                                <div className="w-[75px]"><input onClick={e => e.preventDefault()} className="w-full border-[1px] rounded-[8px] px-[8px] border-solid border-[#CBD5E1] h-[40px] text-[13px]" placeholder="Year" disabled/></div>
                            </div>}
                        </div>
                    </div>

                    {/********************************   DESCRIPTION   ***********************************/}
                    <div className="mt-[20px]">
                        <label className="text-[14px] font-[600]">Description</label>
                        <textarea rows={5} ref={descriptionRef} placeholder="" className="text-[14px]  mt-[12px] border-solid border-[1px] border-[#CBD5E1] px-[12px] py-[8px] rounded-[8px] w-full" value={exp.description} onChange={(e) => onItemChange(expIndex, 'description', e.target.value)} />
                        {descriptionRef.current && <p className="text-[#475569] font-[500] text-[12px]">{`${descriptionRef?.current?.value?.length} of 400 characters used`}</p>}
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

export default AddMemberExperienceForm