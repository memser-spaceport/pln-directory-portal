import { useRouter } from "next/router";
import { createContext, useReducer } from "react";

export const ProjectsContext = createContext({ projectsState: null, projectsDispatch: null });

export function ProjectContextProvider(props) {
    const { query, push, pathname } = useRouter();
    const initialFilterState = {
        FUNDING: query['FUNDING'] && query['FUNDING'] === 'true' ? true : false,
        TEAM: query['TEAM'] ? query['TEAM'] : null
    }

    const defaultState = {
        filterState: { ...initialFilterState }
    }

    const reducer = (state, action) => {
        const newState = { ...state }
        switch (action.type) {
            case 'SET_FILTER':
                // eslint-disable-next-line no-case-declarations
                const { filterType, value } = action.payload;
                // eslint-disable-next-line no-case-declarations
                const oldFilterState = newState.filterState;
                newState.filterState = { ...oldFilterState, [filterType]: value };
                // eslint-disable-next-line no-case-declarations
                const { [filterType]: queryFilterValue,...restQuery } = query;
                push({
                    pathname,
                    query: {
                        ...restQuery,
                        ...(value && {
                            [filterType]: value,
                        }),
                    },
                });
                break;
            case 'CLEAR_FILTER':
                newState.filterState = { FUNDING: false, TEAM: null };
                break;
        }
    
        return newState
    }

    const [projectsState, projectsDispatch] = useReducer(reducer, defaultState);
    return (
        <ProjectsContext.Provider value={{ projectsState, projectsDispatch }}>
            {props.children}
        </ProjectsContext.Provider>
    )
}