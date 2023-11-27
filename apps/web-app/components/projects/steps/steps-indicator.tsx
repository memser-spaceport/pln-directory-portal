import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import { useContext } from "react";

export default function ProjectStepIndicator() {
    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);
    return (
        <>
           Step {addProjectsState.currentStep}
        </>
    );
}