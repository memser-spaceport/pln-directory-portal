import { InputField } from '@protocol-labs-network/ui';
import { ReactComponent as RemoveKPIIcon } from '../../public/assets/images/icons/projects/remove-kpi.svg';
import { useContext } from 'react';
import { AddProjectsContext } from 'apps/web-app/context/projects/add.context';
import InputError from './input-error';
export default function KPI({ onInputChange, kpiFieldArray, setKPIField }) {

    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);

    const getKPIHeader = (field, index) => {
        return <div className="flex justify-between">
            <div className="text-[#64748B] text-[12px] font-bold pb-3">KPI {index + 1}</div>
            {
                index !== 0 && <div className='cursor-pointer' onClick={() => {
                    deleteKPI(field.id)
                }
                }>
                    <RemoveKPIIcon />
                </div>
            }
        </div>
    }

    const getKPILabelHeader = () => {
        return <div className="flex gap-2 text-sm font-bold">
            <div className='basis-1/2'>KPI Name</div>
            <div className='basis-1/2'>KPI Value</div>
        </div>
    }

    const getKPIInput = (field,index) => {
        return <div className="flex gap-2 pb-5">
            <div className='basis-1/2'>
                <InputField
                    name={"kpiname" + field.id}
                    label=""
                    showLabel={false}
                    maxLength={64}
                    value={field.name}
                    onChange={(e) => {
                        onInputChange(e, field.id);
                    }}
                    placeholder="Enter KPI Name"
                    className="custom-grey custom-outline-none border"
                />
                <InputError content={addProjectsState.errors?.KPIs?.[index]?.['name']}/>
            </div>
            <div className='basis-1/2'>
                <InputField
                    name={"kpivalue" + field.id}
                    label=""
                    showLabel={false}
                    maxLength={64}
                    value={field.value}
                    onChange={(e) => {
                        onInputChange(e, field.id);
                    }}
                    placeholder="Enter KPI Value"
                    className="custom-grey custom-outline-none border"
                />
                <InputError content={addProjectsState.errors?.KPIs?.[index]?.['value']}/>
            </div>
        </div>
    }

    const deleteKPI = (id) => {
        const oldField = [...kpiFieldArray];
        const removedArray = oldField.filter((val) => val.id !== id);
        setKPIField([...removedArray]);
        addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'KPIs': [...removedArray] } });
        const errors = { ...addProjectsState.errors };
        if(errors['KPIs']){
            errors['KPIs'] = null;
        }
        removedArray?.map((kpi,index)=>{
            if(kpi.name && !kpi.value){
                if(!errors['KPIs']){
                    errors['KPIs'] = new Array(removedArray.length).fill(null);
                }
                if(!errors['KPIs'][index]){
                    errors['KPIs'][index] = {};
                }
                errors['KPIs'][index]['value'] = 'KPI value is required';
            }
            if(!kpi.name && kpi.value){
                if(!errors['KPIs']){
                    errors['KPIs'] = new Array(removedArray.length).fill(null);
                }
                if(!errors['KPIs'][index]){
                    errors['KPIs'][index] = {};
                }
                errors['KPIs'][index]['name'] = 'KPI name is required';
            }
        });
        addProjectsDispatch({ type: 'SET_ERROR', payload: { ...errors } });
    }

    const addKPIRow = () => {
        const oldField = [...kpiFieldArray];
        oldField.push({
            name: '',
            value: '',
            id: oldField.length === 0 ? 0 : Math.max(...oldField.map((item) => item.id + 1))
        });
        setKPIField([...oldField]);
        const errors = { ...addProjectsState.errors };
        if(errors?.KPIs?.[oldField.length]){
            errors.KPIs[oldField.length] = {};
        }
        addProjectsDispatch({ type: 'SET_ERROR', payload: { ...errors } });
    }

    const getAddMoreTemplate = () => {
        return <div className="font-medium text-sm pt-2 cursor-pointer" onClick={addKPIRow}>
            <span className="text-[#156FF7]">+ Add KPI</span>
            <span className="text-[#94A3B8] pl-1">(max 5)</span>
        </div>
    }

    const getKPIComponent = (field, index) => {
        return <div className="flex flex-col" key={index}>
            {getKPIHeader(field, index)}
            {getKPILabelHeader()}
            {getKPIInput(field,index)}
        </div>
    }
    return <div>
        {
            kpiFieldArray.length > 0 && kpiFieldArray.map((kpi, index) => {
                return getKPIComponent(kpi, index)
            })
        }
        {kpiFieldArray.length < 5 && getAddMoreTemplate()}
    </div>
}