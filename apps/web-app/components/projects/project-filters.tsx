import { Autocomplete, Switch } from "@protocol-labs-network/ui";
import { ProjectsContext } from "apps/web-app/context/projects/project.context";
import api from "apps/web-app/utils/api";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";

export default function ProjectsFilter({ filterProperties }) {

    const { projectsState, projectsDispatch } = useContext(ProjectsContext);
    const { push, pathname, query } = useRouter();
    const [selectedTeam,setSelectedTeam] = useState({ value: '', label: '',logo:'' });

    useEffect(() => {
        setTeam();
    },[])

    const setTeam = () => {
        if(query['TEAM']){
            getSelectedOptionFromQuery(query['TEAM']).then((option) => {
                setSelectedTeam(option);
            })
        }else{
            setSelectedTeam({ value: '', label: '',logo:'' });
        }
    }

    // useEffect(() => {
    //     setSelectedOption().then(option=>{
    //         setSelectedTeam(option);
    //     });
    // },[projectsState.filterState.TEAM])

    const clearFilters = () => {
        const cleanQuery = { ...query };
        filterProperties.forEach((property) => delete cleanQuery[property]);
        console.log(cleanQuery);
        
        push({ pathname, query: cleanQuery });
        projectsDispatch({ type: 'CLEAR_FILTER'});
        setSelectedTeam({ value: '', label: '',logo:'' });
    }

    const handleTeamChange = (team) => {
        setSelectedTeam(team);
        projectsDispatch({ type: 'SET_FILTER', payload: { filterType: 'TEAM', value: team?.label } });
    }

    const getSelectedOptionFromQuery =async (searchTerm) => {
        const response = await fetchTeamsWithLogoSearchTerm(searchTerm);
        
        if (response.length) {
            const item = response[0];
            return item;
        }else{
            return { value: '', label: '',logo:'' }
        }
    }

    const fetchTeamsWithLogoSearchTerm = async (searchTerm) => {
        try {
            const response = await api.get(`/v1/teams?name__istartswith=${searchTerm}&select=uid,name,shortDescription,logo.url,industryTags.title`);
            if (response.data) {
                return response.data.map((item) => {
                    return { value: item.uid, label: item.name, logo: item?.logo?.url ? item.logo.url : null };
                });
            }
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <>
            <div className="relative flex items-center justify-between bg-white p-5 pl-[37px] before:absolute before:bottom-[-0.2rem] before:left-0 before:h-1 before:w-full before:border-t after:absolute after:bottom-0 after:left-0 after:h-7 after:w-[calc(100%_-_1.23rem)] after:translate-y-full after:bg-gradient-to-b after:from-white">
                <span className="text-lg font-semibold leading-7">Filters</span>
                <button
                    className="on-focus--link leading-3.5 text-xs text-blue-600 transition-colors hover:text-blue-700"
                    onClick={clearFilters}
                >
                    Clear filters
                </button>
            </div>

            <div className="h-[calc(100vh_-_148px)] overflow-y-auto p-5 pl-[37px] focus-within:outline-none focus:outline-none focus-visible:outline-none">
                <div className="py-[20px]">
                    {projectsState?.filterState?.FUNDING}
                    <Switch label="Projects Raising Fund"
                        initialValue={projectsState?.filterState?.FUNDING}
                        onChange={(value) => {
                            projectsDispatch({ type: 'SET_FILTER', payload: { filterType: 'FUNDING', value } });
                        }}
                    />
                </div>
                <div>
                    <div className="text-[14px] font-medium">Team</div>
                    <Autocomplete
                        name={'team'}
                        className="custom-grey custom-outline-none border"
                        // key={selectedTeam.label}
                        placeholder="Select Team"
                        selectedOption={selectedTeam}
                        onSelectOption={handleTeamChange}
                        debounceCall={fetchTeamsWithLogoSearchTerm}
                        // validateBeforeChange={true}
                    // validationFnBeforeChange={beforeChangeValidation}
                    // confirmationMessage={MSG_CONSTANTS.CHANGE_CONF_MSG}
                    />
                </div>
            </div>
        </>
    )
}