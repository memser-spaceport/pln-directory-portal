import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import { useContext, useRef, useState } from "react";

import { ReactComponent as RemoveIcon } from '../../../../../public/assets/images/icons/trash_icon.svg';
import { ReactComponent as RecycleIcon } from '../../../../../public/assets/images/icons/recycle.svg';
import Image from "next/image";
import InputError from "../input-error";

export function ProjectLogoUpload() {

    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);

    const [enableHover, setEnableHoverFlag] = useState(addProjectsState.mode === 'EDIT' 
    && addProjectsState.inputs.logoURL !== '/assets/images/icons/projects/default.svg' 
    ? true : false);
    const [isHovered, setIsHovered] = useState(false);
    const [isLogoDeleted, setLogoDeletedFlag] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    


    const handleMouseEnter = () => {
        if (enableHover) {
            setIsHovered(true);
        }
    }

    const handleMouseLeave = () => {
        setIsHovered(false);
    }

    const editLogo = () => {
     if (inputRef.current) {
        inputRef.current.value = '';
      }
      inputRef.current?.click();
    }

    const deleteLogo = () => {
        if (inputRef.current) {
            inputRef.current.value = '';
        }
        setIsHovered(false);
        setEnableHoverFlag(false);
        addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'logoObject': null, 'logoURL': null } });
        setLogoDeletedFlag(true);
    }

    const onImageUpload = (event) => {
        const file = event.target.files?.[0];
        if (file) {
            const isValidFormat = ['image/jpeg', 'image/png'].includes(file.type);
            if (isValidFormat) {
                const tempErr = addProjectsState.errors;
                delete tempErr?.logoError;
                
            } else {
                const tempErr = { ...addProjectsState.errors };
                tempErr['logoError'] = 'Invalid File.';
                addProjectsDispatch({ type: 'SET_ERROR', payload: { ...tempErr } });
                return;
            }
            const sizeInMB = parseFloat((file.size / 1024 ** 2).toFixed(1));
            if (sizeInMB <= 4) {
                const tempErr = addProjectsState.errors;
                delete tempErr?.logoError;
                const reader = new FileReader();
                reader.readAsDataURL(file);
                setLogoDeletedFlag(false);
                reader.onload = () => addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'logoObject': file, 'logoURL': null } });
                setEnableHoverFlag(true);
            } else {
                const tempErr = { ...addProjectsState.errors };
                tempErr['logoError'] = 'Size should be less than 4MB';
                addProjectsDispatch({ type: 'SET_ERROR', payload: { ...tempErr } });
            }
        }
    }

    return (
        <>
            <div className="max-w-[100px]">
                <div className="w-[100px] h-[100px] border rounded-[8px] border-[3px] border-[#CBD5E1] bg-[#F1F5F9] cursor-pointer flex flex-col relative"
                    onMouseOver={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                    {isHovered && (
                        <div className="absolute left-0 top-0 flex h-full w-full items-center justify-center bg-black bg-opacity-40 z-[1]">
                            <span>
                                <RecycleIcon
                                    onClick={(evt) => {
                                        editLogo()
                                    }}
                                    className="h-8 w-8 cursor-pointer"
                                />
                            </span>
                            {(
                                <span className="pl-2">
                                    <RemoveIcon
                                        onClick={(evt) => {
                                            deleteLogo()
                                        }}
                                        className="h-8 w-8 cursor-pointer"
                                    />
                                </span>
                            )}
                        </div>
                    )}
                    <div className="m-auto relative" >
                        {
                            addProjectsState.inputs.logoURL && !isLogoDeleted && addProjectsState.inputs.logoURL !== '/assets/images/icons/projects/default.svg'
                            &&
                            <Image src={addProjectsState.inputs.logoURL} alt="project image" width={100} height={100} />
                        }
                        {
                            addProjectsState.inputs.logoObject
                            && !isLogoDeleted
                            && <Image src={URL.createObjectURL(addProjectsState.inputs.logoObject)} alt="project image" width={100} height={100} />

                        }

                        {
                            (((!addProjectsState.inputs.logoURL || addProjectsState.inputs.logoURL === '/assets/images/icons/projects/default.svg')
                                && !addProjectsState.inputs.logoObject) || isLogoDeleted)
                            && <div>
                                <div className="ml-6">
                                    <Image src={'/assets/images/icons/projects/add-img.svg'} alt="project image" width={24} height={24} />
                                </div>
                                <div className="text-[#156FF7] text-[13px] font-semibold w-[74px] text-center">
                                    Add Project logo
                                </div>
                            </div>
                        }

                        <input
                            id="image-upload-input"
                            type="file"
                            ref={inputRef}
                            accept="image/png, image/jpeg"
                            className={`absolute inset-0 h-full w-full cursor-pointer opacity-0`}
                            onChange={onImageUpload}
                        />
                    </div>
                </div>
                <InputError content={addProjectsState.errors?.logoError} />
            </div>
        </>
    );
}