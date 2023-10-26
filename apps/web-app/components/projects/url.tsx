import { XIcon as CloseIcon } from '@heroicons/react/outline';
import { InputField } from '@protocol-labs-network/ui';
import { AddProjectsContext } from 'apps/web-app/context/projects/add.context';
import React, { useContext } from 'react';

export default function URLDetails({ onInputChange, urlFieldArray, setURLField }) {

    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);

    const getURLHeader = () => {
        return <div className="flex gap-2 text-sm font-bold">
            <div className="basis-2/6">
                Project Link Title
            </div>
            <div className="basis-4/6">
                Project Link
            </div>
        </div>
    }

    const addMoreTemplate = () => {
        return urlFieldArray.length && urlFieldArray.map((field, index) => {
            return <React.Fragment key={index}>{getURLTemplate(index, field)}</React.Fragment>
        })
    }

    const getAddMoreLinkTemplate = () => {
        return <div className="font-medium text-sm pt-2 cursor-pointer" onClick={addURLRow}>
            <span className="text-[#156FF7]">+ Add project URL</span>
            <span className="text-[#94A3B8] pl-1">(max 3)</span>
        </div>
    }

    const getURLTemplate = (index, field) => {
        return <div className="flex gap-2" key={field.id}>
            <div className="basis-2/6">
                <InputField
                    name={"linktext" + field.id}
                    label=""
                    showLabel={false}
                    maxLength={64}
                    value={field.text}
                    onChange={(e) => {
                        onInputChange(e, field.id);
                    }}
                    placeholder="Enter Link Text"
                    className="custom-grey custom-outline-none border"
                />
            </div>
            <div className="w-[340px]">
                <InputField
                    name={"url" + field.id}
                    label=""
                    showLabel={false}
                    maxLength={64}
                    value={field.url}
                    onChange={(e) => {
                        onInputChange(e, field.id);
                    }}
                    placeholder="Enter Link"
                    className="custom-grey custom-outline-none border"
                />
            </div>
            <div className="cursor-pointer" onClick={() => {
                deleteURLRow(field.id)
            }}>
                {
                    index > 0 && <CloseIcon className="cross-icon relative top-[20px]" />
                }
            </div>
        </div>
    }



    const addURLRow = () => {
        const oldField = [...urlFieldArray];
        oldField.push({
            text: '',
            url: '',
            id: Math.max(...oldField.map((item) => item.id + 1))
        });
        setURLField([...oldField]);
    }

    const deleteURLRow = (id) => {
        const oldField = [...urlFieldArray];
        const removedArray = oldField.filter((val) => val.id !== id);
        setURLField([...removedArray]);
        addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'projectURLs': [...removedArray] } });
    }
    return (
        <>
            {getURLHeader()}
            {addMoreTemplate()}
            {getAddMoreLinkTemplate()}
        </>
    );
}