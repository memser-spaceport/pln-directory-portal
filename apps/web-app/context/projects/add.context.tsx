import { createContext, useReducer } from "react";

export const AddProjectsContext = createContext({ addProjectsState: null, addProjectsDispatch: null });

export function AddProjectContextProvider(props) {
    
    const defaultState = {
        inputs: {
            logoURL: '',
            logoObject:'',
            name: '',
            tagline: '',
            // maintainedBy: { value: '', label: '', logo: '' },
            maintainedBy:null,
            maintainedByContributors: [],
            collabTeamsList: [],
            contributingTeams: [],
            contributors: [],
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
            projectFocusAreas: [],
        },
        mode: props.mode,
        errors: null,
        currentStep: 0
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
                // maintainedBy: {
                //     value: projectDetail.maintainingTeam?.uid,
                //     label: projectDetail.maintainingTeam?.name,
                //     logo: projectDetail.maintainingTeam?.logo?.url
                // },
                maintainedBy: {
                    uid: projectDetail.maintainingTeam?.uid,
                    name: projectDetail.maintainingTeam?.name,
                    logo: projectDetail.maintainingTeam?.logo?.url
                },
                desc: projectDetail.description,
                maintainedByContributors:[],
                collabTeamsList:[],
                contributors: projectDetail.contributors,
                projectURLs: projectDetail.projectLinks,
                contactEmail: projectDetail.contactEmail,
                fundsNeeded: projectDetail.fundingNeeded,
                KPIs: projectDetail.KPIs,
                readme: projectDetail.readMe,
                contributingTeams: projectDetail.contributingTeams,
                logo:projectDetail.logo,
                projectFocusAreas: projectDetail.projectFocusAreas
            }

            const tempCollab = [];
            if(projectDetail.contributors && projectDetail.contributors.length > 0){
                const tempMaintainer = [];
                projectDetail.contributors.map(contri=>{
                    if(contri?.type === "MAINTENER"){
                        const copyTeam = {
                          uid: contri.member?.uid,
                          name: contri.member?.name,
                          logo: contri.member?.image?.url,
                          cuid: contri.uid,
                        };
                        tempMaintainer.push(copyTeam);  
                    }else if(contri?.type === "COLLABORATOR"){
                        tempCollab.push(contri);  
                    }
                });
                if(tempMaintainer.length){
                    defaultState.inputs.maintainedByContributors = [...tempMaintainer];
                }
            }

            projectDetail.contributingTeams?.map((team)=>{
                const temp = {
                    team:{
                        uid: team?.value,
                        name:team?.label,
                        logo:team?.logo
                    },
                    members:[]
                };
                tempCollab?.map(collab=>{
                    if(collab.teamUid === team?.value){
                        const copyTeam = {
                            uid : collab.member?.uid,
                            name: collab.member?.name,
                            logo: collab.member?.image?.url,
                            cuid:collab.uid
                        };
                        temp.members.push(copyTeam);
                    }
                });
                defaultState.inputs.collabTeamsList.push(temp);
            })
        }
    }

    const reducer = (state, action) => {
        const newState = { ...state }
        switch (action.type) {
            case 'SET_INPUT':
                newState.inputs = { ...action.payload };
                break;
            case 'SET_ERROR':
                if(action.payload){
                    newState.errors = { ...action.payload };
                }else{
                    newState.errors = null;
                }
                break;
            case 'SET_CURRENT_STEP':
                newState.currentStep = action.payload;
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