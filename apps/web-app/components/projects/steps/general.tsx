import { InputField, Switch, TextArea } from "@protocol-labs-network/ui";
import { ProjectLogoUpload } from "./components/general/logo-upload";
import { useContext, useEffect, useState } from "react";
import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import InputError from "./components/input-error";
import URLDetails from "./components/general/url";
import Cookies from 'js-cookie';

import { ReactComponent as InformationCircleIcon } from '../../../public/assets/images/icons/info_icon.svg';

export default function General({ onInputChange, urlFieldArray, setURLField }) {
    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);

    useEffect(() => {
        getEmail();
    }, [])



    const getEmail = () => {
        if (addProjectsState.mode === 'ADD') {
            const userInfoFromCookie = Cookies.get('userInfo');
            let email = ''
            if (userInfoFromCookie) {
                const parsedUserInfo = JSON.parse(userInfoFromCookie);
                email = parsedUserInfo.email;
            }
            addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'contactEmail': email } });
        }
    }


    return (
        <>
            <div className="my-5 bg-white px-[42px] py-[24px] rounded-[8px] flex flex-col gap-4">
                <div className="flex">
                    <ProjectLogoUpload />
                    <div className="relative left-[20px] basis-[85%]">
                        <InputField
                            required={true}
                            name="name"
                            label="Project Name"
                            maxLength={64}
                            value={addProjectsState.inputs.name}
                            onChange={onInputChange}
                            placeholder="Enter Project Name Here"
                            className="custom-grey custom-outline-none border"
                        />
                        <InputError content={addProjectsState.errors?.name} />
                    </div>
                </div>
                <div className="flex gap-1">
                    <div>
                        <InformationCircleIcon />
                    </div>
                    <div className="text-[13px] font-medium opacity-40">
                        The uploaded image must be 1:1 ratio in PNG or JPEG format. Max file size is 4MB.
                    </div>
                </div>
                <div>
                    <InputField
                        required={true}
                        name="tagline"
                        label="Project Tagline"
                        maxLength={100}
                        value={addProjectsState.inputs.tagline}
                        onChange={onInputChange}
                        placeholder="Enter Your Project Tagline"
                        className="custom-grey custom-outline-none border"
                    />
                    <div className="px-2 text-sm text-slate-300 flex justify-between flex-row-reverse">
                        <div>{addProjectsState.inputs.tagline.length}/100</div>
                        <InputError content={addProjectsState.errors?.tagline} />
                    </div>
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
                        // required
                        name="contactEmail"
                        type="email"
                        label="Contact Email"
                        value={addProjectsState.inputs.contactEmail}
                        onChange={onInputChange}
                        placeholder="Enter your email address"
                        className="custom-grey custom-outline-none border"
                    />
                    <InputError content={addProjectsState.errors?.contactEmail} />
                </div>
                <div className="flex text-sm font-semibold gap-2 pt-2">
                    <Switch
                        initialValue={addProjectsState.mode === 'ADD' ? false : addProjectsState.inputs.fundsNeeded}
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
            </div>
        </>
    );
}