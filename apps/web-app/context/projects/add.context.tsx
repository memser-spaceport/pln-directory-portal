import { createContext, useReducer } from "react";

export const AddProjectsContext = createContext({ addProjectsState: null, addProjectsDispatch: null });

export function AddProjectContextProvider(props) {
    
    const defaultState = {
        inputs: {
            logoURL: '',
            name: '',
            tagline: '',
            desc: '',
            projectURLs: [],
            contactEmail: '',
            fundsNeeded: false,
            KPIs: [],
            readme: ''
        },
        errors: null
    }

    const reducer = (state, action) => {
        const newState = { ...state }
        switch (action.type) {
            case 'SET_INPUT':
                newState.inputs = { ...action.payload };
                break;
            case 'SET_ERROR':
                newState.errors = { ...action.payload };
                break;
        }
    
        return newState
    }

    const [addProjectsState, addProjectsDispatch] = useReducer(reducer, defaultState);
    return (
        <AddProjectsContext.Provider value={{ addProjectsState, addProjectsDispatch }}>
            {props.children}
        </AddProjectsContext.Provider>
    )
}