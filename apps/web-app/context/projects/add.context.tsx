import { createContext, useReducer } from "react";

export const AddProjectsContext = createContext({ addProjectsState: null, addProjectsDispatch: null });

export function AddProjectContextProvider(props) {
    
    const defaultState = {
        inputs: {
            logoURL: '',
            logoObject:'',
            name: '',
            tagline: '',
            maintainedBy: { value: '', label: '', logo: '' },
            contributingTeams: [],
            desc: '',
            projectURLs: [{
                name: '',
                value: '',
                id: 0
            }],
            contactEmail: '',
            fundsNeeded: false,
            KPIs: [],
            readme: '## Sample Template\n### Goals \nExplain the problems, use case or user goals this project focuses on\n### Proposed Solution\nHow will this project solve the user problems & achieve it’s goals\n### Milestones\n| Milestone | Milestone Description | When |\n| - | - | - |\n| content | content | content |\n| content | content | content |\n                \n### Contributing Members\n| Member Name | Member Role | GH Handle | Twitter/Telegram |\n| - | - | - | - |\n| content | content | content | content |\n| content | content | content | content |\n\n### Reference Documents\n- [Reference Document](https://plsummit23.labweek.io/)\n\n',
            id:'',
            logo:null,
        },
        mode: props.mode,
        errors: null
    }

    if(props.mode === 'EDIT'){
        const projectDetail = props.data ?? null;
        if(projectDetail){
            defaultState.inputs = {
                id:projectDetail.id,
                logoURL: projectDetail.image,
                logoObject:'',
                name: projectDetail.name,
                tagline: projectDetail.tagline,
                maintainedBy: {
                    value: projectDetail.maintainingTeam?.uid,
                    label: projectDetail.maintainingTeam?.name,
                    logo: projectDetail.maintainingTeam?.logo?.url
                },
                desc: projectDetail.description,
                projectURLs: projectDetail.projectLinks,//have to set
                contactEmail: projectDetail.contactEmail,
                fundsNeeded: projectDetail.fundingNeeded,
                KPIs: projectDetail.KPIs,//have to set
                readme: projectDetail.readMe,
                contributingTeams: projectDetail.contributingTeams,
                logo:projectDetail.logo
            }
        }
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