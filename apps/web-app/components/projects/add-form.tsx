import { InputField, Switch, TextArea } from "@protocol-labs-network/ui";
import Image from "next/image";
import { ReactComponent as InformationCircleIcon } from '../../public/assets/images/icons/info_icon.svg';
import KPI from "./kpi";
import React, { useContext, useState } from "react";
import URLDetails from "./url";
import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import InputError from "./input-error";
import { MdEditor } from "md-editor-rt";
import 'md-editor-rt/lib/style.css';

export default function AddForm() {

    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);

    const [kpiFieldArray, setKPIField] = useState([{
        name: '',
        value: '',
        id: 0
    }]);

    const [urlFieldArray, setURLField] = useState([{
        text: '',
        url: '',
        id: 0
    }]);


    const onInputChange = (event, id?) => {
        if (id === 'additional') {
            addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'readme': event } });
        } else if (id === 'fund') {
            addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'fundsNeeded': event } });
        } else {
            const { name, value } = event.target;
            if (name.includes('linktext')) {
                const oldField = [...urlFieldArray];
                const [changedField] = oldField.filter((val) => val.id === id);
                changedField.text = value;
                addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'projectURLs': oldField } });
            } else if (name.includes('url')) {
                const oldField = [...urlFieldArray];
                const [changedField] = oldField.filter((val) => val.id === id);
                changedField.url = value;
                addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'projectURLs': oldField } });
            } else if (name.includes('kpiname')) {
                const oldField = [...kpiFieldArray];
                const [changedField] = oldField.filter((val) => val.id === id);
                changedField.name = value;
                addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'KPIs': oldField } });
            } else if (name.includes('kpivalue')) {
                const oldField = [...kpiFieldArray];
                const [changedField] = oldField.filter((val) => val.id === id);
                changedField.value = value;
                addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'KPIs': oldField } });
            } else {
                addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, [name]: value } });
            }
        }


    }

    const onImageUpload = (event) => {
        const file = event.target.files?.[0];
        if (file) {
            const isValidFormat = ['image/jpeg', 'image/png'].includes(file.type);
            if (isValidFormat) {
                // setError('');
            } else {
                // setError(`Please upload image in jpeg or png format`);
                // return;
            }
            const sizeInMB = parseFloat((file.size / 1024 ** 2).toFixed(1));
            if (sizeInMB <= 4) {
                // onImageChange(file);
                const reader = new FileReader();
                reader.readAsDataURL(file);
                console.log(reader.result);
                
                reader.onload = () => addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'logoURL': file } });
                // setError('');
            } else {
                // setError(`Please upload a file less than ${maxSize}MB`);
            }
        }
    }

    return (
        <>
            <div className="mt-5 bg-white px-[42px] py-[24px] rounded-[8px] flex flex-col gap-4">
                <div className="flex">
                    <div className="w-[100px] h-[100px] border rounded-[8px] border-[3px] border-[#CBD5E1] bg-[#F1F5F9] cursor-pointer flex flex-col">
                        <div className="m-auto">
                            <div className="ml-6">
                                <Image src={'/assets/images/icons/projects/add-img.svg'} alt="project image" width={24} height={24} />
                            </div>
                            <div className="text-[#156FF7] text-[13px] font-semibold w-[74px] text-center">
                                Add Project logo
                            </div>
                            <input
                                id="image-upload-input"
                                type="file"
                                accept="image/png, image/jpeg"
                                className={`absolute inset-0 h-full w-full cursor-pointer opacity-0`}
                                onChange={onImageUpload}
                            />
                        </div>

                    </div>
                    <div className="relative left-[20px] basis-[79%]">
                        <InputField
                            required={true}
                            name="name"
                            label="Project Name"
                            pattern="^[a-zA-Z\s]*$"
                            maxLength={64}
                            value={addProjectsState.inputs.name}
                            onChange={onInputChange}
                            placeholder="Enter Project Name Here"
                            className="custom-grey custom-outline-none border"
                        />
                        <InputError content={addProjectsState.errors?.name} />
                    </div>
                </div>
                <div>
                    <InputField
                        required={true}
                        name="tagline"
                        label="Project Tagline"
                        pattern="^[a-zA-Z\s]*$"
                        maxLength={80}
                        value={addProjectsState.inputs.tagline}
                        onChange={onInputChange}
                        placeholder="Enter Your Project Tagline"
                        className="custom-grey custom-outline-none border"
                    />
                    <InputError content={addProjectsState.errors?.tagline} />
                </div>
                <div>
                    <TextArea
                        required
                        onChange={onInputChange}
                        maxLength={1000}
                        value={addProjectsState.inputs.desc}
                        name="desc"
                        label="Detailed description of your project"
                        className="custom-grey custom-outline-none min-h-[200px] border"
                        placeholder="Enter description of your project"
                    />
                    <InputError content={addProjectsState.errors?.desc} />
                </div>
                <div>
                    <URLDetails onInputChange={onInputChange} urlFieldArray={urlFieldArray} setURLField={setURLField} />
                </div>
                <div>
                    <InputField
                        required
                        name="contactEmail"
                        type="email"
                        label="Contact Email"
                        value={'abc@gmail.com'}
                        onChange={onInputChange}
                        disabled={true}
                        placeholder="Enter your email address"
                        className="custom-grey custom-outline-none border"
                    />
                    <InputError content={addProjectsState.errors?.contactEmail} />
                </div>
                <div className="flex text-sm font-semibold gap-2 pt-2">
                    <Switch
                        initialValue={false}
                        onChange={(e) => { onInputChange(e, 'fund') }}
                    />
                    <div>
                        Are you currently looking to raise funds for your project?
                    </div>
                </div>
                <div className="flex gap-1">
                    <div>
                        <InformationCircleIcon />
                    </div>
                    <div className="text-[13px] font-medium opacity-40">
                        Enabling this implies you are raising funds to support your project. You will be approached by investors who are interested in your project
                    </div>
                </div>
                <div>
                    <KPI kpiFieldArray={kpiFieldArray} setKPIField={setKPIField} onInputChange={onInputChange} />
                </div>
                <div>
                    {/* <TextArea
                                value={''}
                                onChange={onInputChange}
                                maxLength={2000}
                                name="readme"
                                label="Readme.md"
                                className="custom-grey custom-outline-none min-h-[200px] border"
                                placeholder="Enter additional information about your project"
                            /> */}
                    <div className=" text-sm font-bold pb-4 ">Additional Details</div>
                    <MdEditor modelValue={addProjectsState.inputs.readme} onChange={(content) => { onInputChange(content, 'additional') }} language={'en-US'} toolbarsExclude={['catalog', 'github', 'save', 'htmlPreview']} />
                </div>
            </div>
        </>
    )
}