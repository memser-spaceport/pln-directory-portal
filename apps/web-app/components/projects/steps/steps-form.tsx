import { useContext, useState } from "react";
import General from "./general";
import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import Contributors from '../details/contributors';
import KPI from "./kpi";
import { MdEditor } from "md-editor-rt";
import 'md-editor-rt/lib/style.css';
import ProjectContributors from "./project-contributors";

export default function ProjectForms() {
    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);

    const [urlFieldArray, setURLField] = useState(addProjectsState.mode === 'ADD' ? [{
        text: '',
        url: '',
        id: 0
    }] : addProjectsState.inputs.projectURLs.length ? [...addProjectsState.inputs.projectURLs] : [{
        text: '',
        url: '',
        id: 0
    }]);

    const [kpiFieldArray, setKPIField] = useState(addProjectsState.mode === 'ADD' ? [{
        name: '',
        value: '',
        id: 0
    }] :
        addProjectsState.inputs.KPIs.length
            ?
            [...addProjectsState.inputs.KPIs]
            :
            [{
                name: '',
                value: '',
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


    const getForm = () => {

        switch (addProjectsState.currentStep) {
            case 0:
                return (
                    <>
                        <General onInputChange={onInputChange} urlFieldArray={urlFieldArray} setURLField={setURLField} />
                    </>
                );
            case 1:
                return (
                    <>
                        <ProjectContributors/>
                    </>
                );
            case 2:
                return (
                    <>
                        <KPI kpiFieldArray={kpiFieldArray} setKPIField={setKPIField} onInputChange={onInputChange} />
                    </>
                );
            case 3:
                return (
                    <MdEditor modelValue={addProjectsState.inputs.readme} onChange={(content) => { onInputChange(content, 'additional') }} language={'en-US'} toolbarsExclude={['catalog', 'github', 'save', 'htmlPreview']} />
                );
        }


    }

    return (
        <>
            {getForm()}
        </>
    );
}